import type {
  PluginActor,
  PluginInvocationContext,
  PluginLogger,
  TenantRecordStore,
  PluginKnowledgeService,
  PluginConnectionsService,
  PluginFormsService,
  PluginPersonaHostService,
} from "../contracts/contexts.js";
import type { PluginStructuredClassificationService } from "../contracts/structured-classification.js";
import type { DataInsightAuthorizationContext } from "../contracts/data-insight.js";
import type {
  PluginAgentRunSnapshotV1,
  PluginAgentRunsServiceV1,
} from "../contracts/agent-runs.js";
import type { PluginDocumentCaptureServiceV1 } from "../contracts/document-capture.js";
import type { JsonValue } from "../contracts/manifest.js";
import { parsePluginAgentRunRequestV1 } from "../validation/agent-runs.js";
import {
  parsePluginDocumentCaptureResultV1,
  parsePluginDocumentCaptureUrlRequestV1,
  verifyPluginCapturedDocumentTextV1,
} from "../validation/document-capture.js";
import type { PluginManifest } from "../contracts/manifest.js";

export interface TestLogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  fields?: Readonly<Record<string, unknown>>;
}

export interface TestContext extends PluginInvocationContext {
  readonly logs: TestLogEntry[];
}

/**
 * Verified Embedded Chat identity a test supplies for a tool invocation. Use a
 * placeholder `identityAssertion` such as `"header.payload.signature"` unless
 * the test verifies a real signature.
 */
export type TestEmbeddedChatOptions = NonNullable<
  PluginInvocationContext["embeddedChat"]
>;

const COMPACT_JWS = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function testEmbeddedChat(
  value: TestEmbeddedChatOptions,
): TestEmbeddedChatOptions {
  if (typeof value !== "object" || value === null)
    throw new TypeError("embeddedChat must be an object.");
  const { widgetId, externalUserId, identityAssertion } = value;
  if (typeof widgetId !== "string" || widgetId.trim() === "")
    throw new TypeError("embeddedChat.widgetId must be a non-empty string.");
  if (typeof externalUserId !== "string" || externalUserId.trim() === "")
    throw new TypeError(
      "embeddedChat.externalUserId must be a non-empty string.",
    );
  // The host omits the field rather than sending an empty or malformed value.
  if (
    identityAssertion !== undefined &&
    (typeof identityAssertion !== "string" ||
      !COMPACT_JWS.test(identityAssertion))
  )
    throw new TypeError(
      "embeddedChat.identityAssertion must be a compact JWS (header.payload.signature) when present.",
    );
  return Object.freeze({
    widgetId,
    externalUserId,
    ...(identityAssertion === undefined ? {} : { identityAssertion }),
  });
}

export function createTestContext(
  options: {
    tenantId?: string;
    actor?: PluginActor;
    signal?: AbortSignal;
    tenantRecords?: TenantRecordStore;
    knowledge?: PluginKnowledgeService;
    connections?: PluginConnectionsService;
    forms?: PluginFormsService;
    host?: Partial<PluginPersonaHostService>;
    structuredClassification?: PluginStructuredClassificationService;
    agentRuns?: PluginAgentRunsServiceV1;
    documentCapture?: PluginDocumentCaptureServiceV1;
    dataInsightAuthorization?: DataInsightAuthorizationContext;
    settings?: Readonly<Record<string, JsonValue>>;
    /**
     * Verified Embedded Chat identity for a chat tool invocation, optionally
     * with the host-signed `identityAssertion`. Copied and frozen.
     */
    embeddedChat?: TestEmbeddedChatOptions;
  } = {},
): TestContext {
  const logs: TestLogEntry[] = [];
  const logger = createCapturingLogger(logs);
  return {
    tenantId: options.tenantId ?? "tenant-test",
    actor: options.actor ?? { id: "user-test", role: "admin", kind: "user" },
    signal: options.signal ?? new AbortController().signal,
    logger,
    logs,
    settings: options.settings ?? {},
    ...(options.embeddedChat === undefined
      ? {}
      : { embeddedChat: testEmbeddedChat(options.embeddedChat) }),
    ...(options.tenantRecords === undefined
      ? {}
      : { tenantRecords: options.tenantRecords }),
    ...(options.knowledge === undefined
      ? {}
      : { knowledge: options.knowledge }),
    ...(options.connections === undefined
      ? {}
      : { connections: options.connections }),
    ...(options.forms === undefined ? {} : { forms: options.forms }),
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.structuredClassification === undefined
      ? {}
      : { structuredClassification: options.structuredClassification }),
    ...(options.agentRuns === undefined
      ? {}
      : { agentRuns: options.agentRuns }),
    ...(options.documentCapture === undefined
      ? {}
      : { documentCapture: options.documentCapture }),
    ...(options.dataInsightAuthorization === undefined
      ? {}
      : { dataInsightAuthorization: options.dataInsightAuthorization }),
  };
}

export type TestInvocation =
  { kind: "action"; id: string } | { kind: "scheduledJob"; id: string };

/**
 * Builds the public service surface authorized by a manifest and invocation.
 * This is intentionally stricter than createTestContext, which remains a
 * backwards-compatible low-level injection helper.
 *
 * Actions and scheduled jobs are not plugin tool calls, so `embeddedChat`
 * never carries an `identityAssertion` here, and scheduled jobs never run in
 * an Embedded Chat turn and receive no `embeddedChat` at all. Test a tool that
 * forwards the assertion with createTestContext.
 */
export function createAuthorizedTestContext(
  manifest: PluginManifest,
  invocation: TestInvocation,
  options: Parameters<typeof createTestContext>[0] = {},
): TestContext {
  const {
    knowledge: suppliedKnowledge,
    connections: suppliedConnections,
    structuredClassification: suppliedStructuredClassification,
    host: suppliedHost,
    agentRuns: suppliedAgentRuns,
    documentCapture: suppliedDocumentCapture,
    embeddedChat: suppliedEmbeddedChat,
    ...baseOptions
  } = options;
  const checkedEmbeddedChat =
    suppliedEmbeddedChat === undefined
      ? undefined
      : testEmbeddedChat(suppliedEmbeddedChat);
  const declaration = manifest.capabilities.knowledge;
  const action =
    invocation.kind === "action"
      ? manifest.capabilities.actions?.find(
          (entry) => entry.id === invocation.id,
        )
      : undefined;
  const scheduledJob =
    invocation.kind === "scheduledJob"
      ? manifest.capabilities.scheduledJobs?.find(
          (entry) => entry.id === invocation.id,
        )
      : undefined;
  const invocationDeclared = action !== undefined || scheduledJob !== undefined;
  // Only a declared action keeps the widget identity, and never the assertion.
  const embeddedChat: TestEmbeddedChatOptions | undefined =
    checkedEmbeddedChat === undefined || action === undefined
      ? undefined
      : {
          widgetId: checkedEmbeddedChat.widgetId,
          externalUserId: checkedEmbeddedChat.externalUserId,
        };
  const readOnlyInvocation = action?.risk === "read";
  const rejectMutation = async (): Promise<never> => {
    throw new Error(
      "Knowledge mutation is not authorized for this invocation.",
    );
  };
  const knowledge: PluginKnowledgeService | undefined =
    suppliedKnowledge && invocationDeclared
      ? {
          ...(declaration?.read === true
            ? {
                search: suppliedKnowledge.search,
                fetchByMetadata: suppliedKnowledge.fetchByMetadata,
              }
            : {}),
          ...(declaration?.write === true && !readOnlyInvocation
            ? {
                createSource: suppliedKnowledge.createSource,
                upsertDocument: suppliedKnowledge.upsertDocument,
                publish: suppliedKnowledge.publish,
              }
            : declaration?.write === true
              ? {
                  createSource: rejectMutation,
                  upsertDocument: rejectMutation,
                  publish: rejectMutation,
                }
              : {}),
          ...(declaration?.delete === true && !readOnlyInvocation
            ? { deleteDocument: suppliedKnowledge.deleteDocument }
            : declaration?.delete === true
              ? { deleteDocument: rejectMutation }
              : {}),
        }
      : undefined;
  const connections: PluginConnectionsService | undefined =
    suppliedConnections && invocationDeclared
      ? {
          materialize: async ({ selector }) => {
            const allowed = manifest.capabilities.connections?.selectors.some(
              (declaration) =>
                declaration.settingKey === selector &&
                (invocation.kind === "action"
                  ? declaration.actionIds?.includes(invocation.id)
                  : declaration.scheduledJobIds?.includes(invocation.id)) ===
                  true,
            );
            if (!allowed)
              throw new Error(
                "Connection selector is not authorized for this invocation.",
              );
            return suppliedConnections.materialize({ selector });
          },
        }
      : undefined;
  const classificationDeclaration =
    manifest.capabilities.structuredClassification;
  const classificationAllowed =
    invocation.kind === "action"
      ? Array.isArray(classificationDeclaration?.actionIds) &&
        classificationDeclaration.actionIds.includes(invocation.id)
      : Array.isArray(classificationDeclaration?.scheduledJobIds) &&
        classificationDeclaration.scheduledJobIds.includes(invocation.id);
  const structuredClassification =
    suppliedStructuredClassification &&
    invocationDeclared &&
    classificationAllowed
      ? suppliedStructuredClassification
      : undefined;
  const runBindings = manifest.capabilities.agentRuns?.bindings ?? [];
  const boundRuns = (
    field: "startActionId" | "getActionId" | "cancelActionId",
  ) =>
    invocation.kind === "action" &&
    runBindings.some((binding) => binding[field] === invocation.id);
  // The host scopes get and cancel to runs of the binding that owns the action.
  // The harness cannot see that ownership before the call, so it rejects any
  // returned snapshot whose binding does not own this action.
  const ownedSnapshot = (
    field: "getActionId" | "cancelActionId",
    snapshot: PluginAgentRunSnapshotV1,
  ): PluginAgentRunSnapshotV1 => {
    // A missing run is reported by the broker throwing, not by an empty result.
    if (
      typeof snapshot !== "object" ||
      snapshot === null ||
      typeof snapshot.bindingId !== "string"
    )
      throw new Error(
        "Agent run broker must resolve a snapshot with a bindingId.",
      );
    if (
      !runBindings.some(
        (binding) =>
          binding.id === snapshot.bindingId && binding[field] === invocation.id,
      )
    )
      throw new Error("Agent run is not authorized for this action's binding.");
    return snapshot;
  };
  const agentRuns: PluginAgentRunsServiceV1 | undefined =
    suppliedAgentRuns &&
    invocationDeclared &&
    (boundRuns("startActionId") ||
      boundRuns("getActionId") ||
      boundRuns("cancelActionId"))
      ? {
          start: async (input) => {
            const binding = runBindings.find(
              (entry) =>
                entry.id === input.bindingId &&
                entry.startActionId === invocation.id,
            );
            if (!binding)
              throw new Error(
                "Agent run binding is not authorized for this action.",
              );
            parsePluginAgentRunRequestV1(input, binding);
            return suppliedAgentRuns.start(input);
          },
          get: async (input) => {
            if (!boundRuns("getActionId"))
              throw new Error(
                "Agent run read is not authorized for this action.",
              );
            return ownedSnapshot(
              "getActionId",
              await suppliedAgentRuns.get(input),
            );
          },
          cancel: async (input) => {
            if (!boundRuns("cancelActionId"))
              throw new Error(
                "Agent run cancellation is not authorized for this action.",
              );
            return ownedSnapshot(
              "cancelActionId",
              await suppliedAgentRuns.cancel(input),
            );
          },
        }
      : undefined;
  const captureDeclaration = manifest.capabilities.documentCapture;
  const captureAllowed =
    captureDeclaration?.schemaVersion === "1" &&
    Array.isArray(captureDeclaration.sources) &&
    captureDeclaration.sources.includes("url") &&
    (invocation.kind === "action"
      ? action !== undefined &&
        action.risk === "external" &&
        action.deploymentAdminOnly !== true &&
        Array.isArray(captureDeclaration.actionIds) &&
        captureDeclaration.actionIds.includes(invocation.id)
      : scheduledJob !== undefined &&
        Array.isArray(captureDeclaration.scheduledJobIds) &&
        captureDeclaration.scheduledJobIds.includes(invocation.id));
  const signal = baseOptions.signal;
  // Mirrors the host: cancellation rejects with the signal's reason and is
  // never turned into an error result, whenever it happens.
  const throwIfCancelled = () => {
    if (signal?.aborted) throw signal.reason;
  };
  const untilCancelled = <T>(pending: Promise<T>): Promise<T> => {
    if (!signal) return pending;
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      pending.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          if (signal.aborted) reject(signal.reason);
          else resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(signal.aborted ? signal.reason : error);
        },
      );
    });
  };
  const documentCapture: PluginDocumentCaptureServiceV1 | undefined =
    suppliedDocumentCapture && invocationDeclared && captureAllowed
      ? {
          fromUrl: async (input) => {
            throwIfCancelled();
            const request = parsePluginDocumentCaptureUrlRequestV1(input);
            // Forward the validated request as the host acts on it: the
            // normalized URL, defaults applied, hints only when set.
            const raw = await untilCancelled(
              suppliedDocumentCapture.fromUrl({
                url: request.normalizedUrl,
                maxTextBytes: request.maxTextBytes,
                ...(request.maxResponseBytes === undefined
                  ? {}
                  : { maxResponseBytes: request.maxResponseBytes }),
                ...(request.timeoutMs === undefined
                  ? {}
                  : { timeoutMs: request.timeoutMs }),
              }),
            );
            throwIfCancelled();
            const result = parsePluginDocumentCaptureResultV1(raw, request);
            if (result.ok) {
              const matches = await verifyPluginCapturedDocumentTextV1(
                result.document,
              );
              // The digest is asynchronous; a cancellation during it still wins.
              throwIfCancelled();
              if (!matches)
                throw new Error(
                  "Document capture broker returned a textSha256 that does not match text.",
                );
            }
            return result;
          },
        }
      : undefined;
  return createTestContext({
    ...baseOptions,
    ...(embeddedChat === undefined ? {} : { embeddedChat }),
    ...(agentRuns === undefined ? {} : { agentRuns }),
    ...(documentCapture === undefined ? {} : { documentCapture }),
    ...(suppliedHost &&
    invocationDeclared &&
    manifest.id === "data_insight_sql" &&
    manifest.capabilities.personaHost?.schemaVersion === "1"
      ? { host: suppliedHost }
      : {}),
    ...(knowledge === undefined ? {} : { knowledge }),
    ...(connections === undefined ? {} : { connections }),
    ...(structuredClassification === undefined
      ? {}
      : { structuredClassification }),
  });
}

function createCapturingLogger(entries: TestLogEntry[]): PluginLogger {
  return {
    debug: (message, fields) =>
      entries.push(withOptionalFields("debug", message, fields)),
    info: (message, fields) =>
      entries.push(withOptionalFields("info", message, fields)),
    warn: (message, fields) =>
      entries.push(withOptionalFields("warn", message, fields)),
    error: (message, fields) =>
      entries.push(withOptionalFields("error", message, fields)),
  };
}

function withOptionalFields(
  level: TestLogEntry["level"],
  message: string,
  fields: Readonly<Record<string, unknown>> | undefined,
): TestLogEntry {
  return fields === undefined ? { level, message } : { level, message, fields };
}

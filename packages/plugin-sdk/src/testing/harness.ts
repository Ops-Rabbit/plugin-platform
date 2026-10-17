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
import type { JsonValue } from "../contracts/manifest.js";
import { parsePluginAgentRunRequestV1 } from "../validation/agent-runs.js";
import type { PluginManifest } from "../contracts/manifest.js";

export interface TestLogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  fields?: Readonly<Record<string, unknown>>;
}

export interface TestContext extends PluginInvocationContext {
  readonly logs: TestLogEntry[];
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
    dataInsightAuthorization?: DataInsightAuthorizationContext;
    settings?: Readonly<Record<string, JsonValue>>;
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
    ...(options.dataInsightAuthorization === undefined
      ? {}
      : { dataInsightAuthorization: options.dataInsightAuthorization }),
  };
}

export type TestInvocation =
  | { kind: "action"; id: string }
  | { kind: "scheduledJob"; id: string };

/**
 * Builds the public service surface authorized by a manifest and invocation.
 * This is intentionally stricter than createTestContext, which remains a
 * backwards-compatible low-level injection helper.
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
    ...baseOptions
  } = options;
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
    if (
      !runBindings.some(
        (binding) =>
          binding.id === snapshot?.bindingId &&
          binding[field] === invocation.id,
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
  return createTestContext({
    ...baseOptions,
    ...(agentRuns === undefined ? {} : { agentRuns }),
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

import type {
  PluginActor,
  PluginInvocationContext,
  PluginLogger,
  TenantRecordStore,
  PluginKnowledgeService,
  PluginConnectionsService,
  PluginFormsService,
} from "../contracts/contexts.js";
import type { PluginStructuredClassificationService } from "../contracts/structured-classification.js";
import type { JsonValue } from "../contracts/manifest.js";
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
    structuredClassification?: PluginStructuredClassificationService;
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
    ...(options.structuredClassification === undefined
      ? {}
      : { structuredClassification: options.structuredClassification }),
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
  return createTestContext({
    ...baseOptions,
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

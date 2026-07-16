import type {
  PluginActor,
  PluginInvocationContext,
  PluginLogger,
  TenantRecordStore,
} from "../contracts/contexts.js";
import type { JsonValue } from "../contracts/manifest.js";

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
  };
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

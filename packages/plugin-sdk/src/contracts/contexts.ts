import type { JsonValue } from "./manifest.js";

export interface PluginActor {
  readonly id: string;
  readonly role: "admin" | "operator" | "viewer" | "system";
  readonly kind: "user" | "system";
}

export interface PluginInvocationContext {
  readonly tenantId: string;
  readonly actor: PluginActor;
  readonly signal: AbortSignal;
  readonly logger: PluginLogger;
  readonly settings: Readonly<Record<string, JsonValue>>;
  readonly tenantRecords?: TenantRecordStore;
}

export interface PluginRouteContext extends PluginInvocationContext {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

export interface PluginLogger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface TenantRecordStore {
  get<T extends JsonValue>(
    collection: string,
    id: string,
  ): Promise<T | undefined>;
  put<T extends JsonValue>(
    collection: string,
    id: string,
    value: T,
  ): Promise<void>;
  delete(collection: string, id: string): Promise<boolean>;
}

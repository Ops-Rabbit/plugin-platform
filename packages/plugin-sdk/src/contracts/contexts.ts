export interface PluginActor {
  readonly id: string;
  readonly role: "admin" | "operator" | "viewer" | "system";
}

export interface PluginInvocationContext {
  readonly tenantId: string;
  readonly actor: PluginActor;
  readonly signal: AbortSignal;
  readonly logger: PluginLogger;
  readonly tenantRecords?: TenantRecordStore;
}

export interface PluginLogger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, fields?: Readonly<Record<string, unknown>>): void;
}

export interface TenantRecordStore {
  get<T>(collection: string, id: string): Promise<T | undefined>;
  put<T>(collection: string, id: string, value: T): Promise<void>;
  delete(collection: string, id: string): Promise<boolean>;
}

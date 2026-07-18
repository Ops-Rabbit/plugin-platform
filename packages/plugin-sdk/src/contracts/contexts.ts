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
  readonly database?: PluginDatabase;
  readonly objectStore?: PluginObjectStore;
  readonly forms?: PluginFormsService;
}

export interface PluginRouteContext extends PluginInvocationContext {
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
}

export interface PluginIngressPrincipal {
  readonly kind: "api_token";
  readonly tokenId: string;
  readonly subjectId: string;
  readonly scopes: readonly string[];
}

export interface PluginIngressContext extends PluginInvocationContext {
  readonly method: "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  readonly headers: Readonly<Record<string, string>>;
  readonly principal: PluginIngressPrincipal;
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

export interface PluginDatabase {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
    statement: string,
    params?: readonly unknown[],
  ): Promise<T | undefined>;
  execute(statement: string, params?: readonly unknown[]): Promise<number>;
  transaction<T>(run: (database: PluginDatabase) => Promise<T>): Promise<T>;
}

export interface PluginObjectUpload {
  readonly objectId: string;
  readonly method: "PUT";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface PluginObjectMetadata {
  readonly objectId: string;
  readonly contentType: string;
  readonly contentLength: number;
  readonly sha256: string;
  readonly createdAt: string;
}

export interface PluginObjectStore {
  createUpload(input: {
    contentType: string;
    contentLength: number;
    sha256: string;
  }): Promise<PluginObjectUpload>;
  stat(objectId: string): Promise<PluginObjectMetadata | undefined>;
  delete(objectId: string): Promise<boolean>;
}

export interface PluginFormSubmission {
  readonly id: string;
  readonly moduleKey: string;
  readonly recordType: string;
  readonly status: string;
  readonly values: Readonly<Record<string, JsonValue>>;
}

export interface PluginFormsService {
  createSubmission(input: {
    starterKey: string;
    idempotencyKey?: string;
    parentSubmissionId?: string;
    values: Readonly<Record<string, JsonValue>>;
    action: "save_draft" | "submit";
  }): Promise<PluginFormSubmission>;
  getSubmission(
    submissionId: string,
  ): Promise<PluginFormSubmission | undefined>;
  updateSubmission(
    submissionId: string,
    values: Readonly<Record<string, JsonValue>>,
  ): Promise<PluginFormSubmission>;
  attachObject(input: {
    submissionId: string;
    fieldKey: string;
    objectId: string;
    label: string;
  }): Promise<{ attachmentId: string }>;
}

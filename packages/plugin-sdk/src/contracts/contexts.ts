import type { JsonValue } from "./manifest.js";

export interface PluginActor {
  readonly id: string;
  readonly role: "admin" | "operator" | "viewer" | "system";
  readonly kind: "user" | "system";
}

export type PluginUserActor = PluginActor & {
  readonly role: "admin" | "operator" | "viewer";
  readonly kind: "user";
};

export interface PluginInvocationContext {
  readonly tenantId: string;
  readonly actor: PluginActor;
  readonly signal: AbortSignal;
  readonly logger: PluginLogger;
  readonly settings: Readonly<Record<string, JsonValue>>;
  /** Immutable application-selected conversation values. Untrusted; never authorization. */
  readonly conversationBindings?: Readonly<Record<string, JsonValue>>;
  /** Verified embedded-chat identity. Use this to authorize untrusted conversation bindings. */
  readonly embeddedChat?: Readonly<{
    widgetId: string;
    externalUserId: string;
  }>;
  readonly tenantRecords?: TenantRecordStore;
  readonly database?: PluginDatabase;
  readonly objectStore?: PluginObjectStore;
  readonly forms?: PluginFormsService;
  readonly knowledge?: PluginKnowledgeService;
  /** Available only for host-authorized deployment-admin route/action calls. */
  readonly identityDirectory?: PluginIdentityDirectoryService;
  readonly audit?: PluginAuditService;
}

export interface PluginIdentityDirectoryUser {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly role: "admin" | "operator" | "viewer";
  readonly active: boolean;
}

export interface PluginIdentityDirectoryPage {
  readonly users: readonly PluginIdentityDirectoryUser[];
  readonly nextCursor?: string;
}

/** Deployment-admin-only, host-authorized user directory broker. */
export interface PluginIdentityDirectoryService {
  listUsers(input?: {
    query?: string;
    cursor?: string;
    limit?: number;
  }): Promise<PluginIdentityDirectoryPage>;
  getUser(userId: string): Promise<PluginIdentityDirectoryUser | undefined>;
}

export interface PluginAuditService {
  record(input: {
    eventType: string;
    subjectType?: string;
    subjectId?: string;
    outcome: "success" | "rejected" | "failed";
    metadata?: Readonly<Record<string, JsonValue>>;
  }): Promise<void>;
}

export type PluginKnowledgeSource = Readonly<Record<string, JsonValue>> & {
  readonly id: string;
  readonly key: string;
  readonly name: string;
};

export type PluginKnowledgeDocument = Readonly<Record<string, JsonValue>> & {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly contentHash: string;
};

export type PluginKnowledgePublication = Readonly<Record<string, JsonValue>> & {
  readonly generationId: string;
  readonly documentCount: number;
  readonly chunkCount: number;
};

/** Host-managed ingestion into a source owned by the invoking plugin. */
export interface PluginKnowledgeService {
  createSource(input: {
    key: string;
    name: string;
    description?: string;
  }): Promise<PluginKnowledgeSource>;
  upsertDocument(input: {
    sourceKey: string;
    key: string;
    title: string;
    content: string;
    contentType?: "text/plain" | "text/markdown" | "text/html";
    sourceUri?: string;
    revision?: string;
    metadata?: Readonly<Record<string, JsonValue>>;
  }): Promise<PluginKnowledgeDocument>;
  publish(sourceKey: string): Promise<PluginKnowledgePublication>;
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

/** Database facade already bound to a host transaction. */
export type TransactionBoundPluginDatabase = Pick<
  PluginDatabase,
  "query" | "queryOne" | "execute"
>;

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

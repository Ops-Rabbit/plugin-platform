import type { JsonValue } from "./manifest.js";
import type { PluginStructuredClassificationService } from "./structured-classification.js";

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
  readonly connections?: PluginConnectionsService;
  /** Available only for host-authorized deployment-admin route/action calls. */
  readonly identityDirectory?: PluginIdentityDirectoryService;
  readonly audit?: PluginAuditService;
  /** Host-governed classifier, exposed only to manifest-bound actions and jobs. */
  readonly structuredClassification?: PluginStructuredClassificationService;
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

export interface PluginMaterializedSecret {
  readonly value: string;
  /** `file` means the host materialized a file-backed secret for this invocation. */
  readonly source: "value" | "file";
}

export interface PluginMaterializedImapConnection {
  readonly integrationType: "imap_mailbox";
  readonly host: string;
  readonly port: number;
  readonly security: "tls" | "starttls";
  readonly username: PluginMaterializedSecret;
  readonly password: PluginMaterializedSecret;
  readonly allowedFolders: readonly string[];
  readonly serverName?: string;
}

/** Host-authorized materialization of the manifest selector bound to this invocation. */
export interface PluginConnectionsService {
  materialize(input: {
    selector: string;
  }): Promise<PluginMaterializedImapConnection>;
}

export interface PluginKnowledgeReadFilters {
  sourceKey?: string;
  caseId?: string;
  sourceRevision?: string;
  section?: string;
}

export interface PluginKnowledgeReadDocument {
  readonly key: string;
  readonly sourceKey: string;
  readonly title: string;
  readonly content: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
  readonly score: number;
}

export interface PluginKnowledgeWriteService {
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

export interface PluginKnowledgeDeleteService {
  deleteDocument(input: {
    sourceKey: string;
    key: string;
    reason: string;
  }): Promise<{ deleted: boolean; key: string }>;
}

export interface PluginKnowledgeReadService {
  search(input: {
    query: string;
    filters?: PluginKnowledgeReadFilters;
    /** Defaults to 8; host-enforced maximum is 20. */
    topK?: number;
  }): Promise<{ matches: readonly PluginKnowledgeReadDocument[] }>;
  fetchByMetadata(input: {
    sourceKey: string;
    caseId: string;
    sourceRevision: string;
    /** Defaults to 20; host-enforced maximum is 32. */
    limit?: number;
  }): Promise<{ documents: readonly PluginKnowledgeReadDocument[] }>;
}

/**
 * Backward-compatible composite. Hosts should expose only methods authorized by
 * the manifest capability and invocation risk. New consumers should prefer the
 * dedicated read/write/delete service interfaces.
 */
export interface PluginKnowledgeService {
  createSource?: PluginKnowledgeWriteService["createSource"];
  upsertDocument?: PluginKnowledgeWriteService["upsertDocument"];
  publish?: PluginKnowledgeWriteService["publish"];
  deleteDocument?: PluginKnowledgeDeleteService["deleteDocument"];
  search?: PluginKnowledgeReadService["search"];
  fetchByMetadata?: PluginKnowledgeReadService["fetchByMetadata"];
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

/** Host-authorized deployment-admin action context bound to one transaction. */
export interface DeploymentAdminActionContext
  extends Omit<
    PluginInvocationContext,
    "actor" | "database" | "identityDirectory" | "audit"
  > {
  readonly actor: PluginUserActor & { readonly role: "admin" };
  readonly database: TransactionBoundPluginDatabase;
  readonly identityDirectory: PluginIdentityDirectoryService;
  readonly audit: PluginAuditService;
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
  readonly workflow_stage_key?: string | null;
  readonly governed_approval?: PluginGovernedApproval | null;
  readonly workflow_current_content_hash?: string;
  readonly workflow_current_structured_review_hash?: string;
  readonly workflow_reviewer_user_id?: string | null;
  readonly workflow_transition_id?: string | null;
  readonly workflow_transition_action?: string | null;
  readonly workflow_transition_type?: string | null;
  readonly workflow_transition_from_stage_key?: string | null;
  readonly workflow_transition_to_stage_key?: string | null;
  readonly workflow_approved_content_hash?: string | null;
  readonly workflow_approved_structured_review_hash?: string | null;
  readonly workflow_approved_content_revision?: string | null;
}

export type PluginGovernedApproval = {
  readonly transitionId: string;
  readonly transitionType: "approval";
  readonly toStageKey: "approved";
  readonly reviewerUserId: string;
  readonly approvedContentHash: string;
  readonly approvedStructuredReviewHash: string;
  readonly approvedContentRevision: string;
} & (
  | { readonly action: "approve"; readonly fromStageKey: "awaiting_review" }
  | {
      readonly action: "stage_transition";
      readonly fromStageKey: "awaiting_review" | "in_review";
    }
);

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

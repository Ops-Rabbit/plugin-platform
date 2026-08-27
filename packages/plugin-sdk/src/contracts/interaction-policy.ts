import type {
  PluginActor,
  PluginAuditService,
  PluginDatabase,
  PluginUserActor,
  TransactionBoundPluginDatabase,
} from "./contexts.js";
import type { JsonValue } from "./manifest.js";

export const CHAT_TURN_ADMISSION_SCHEMA_VERSION = "1" as const;
export const CHAT_COMPOSER_STATUS_SCHEMA_VERSION = "1" as const;
export const SUBJECT_LIFECYCLE_SCHEMA_VERSION = "1" as const;
export const DEPLOYMENT_ADMIN_WORKSPACE_SCHEMA_VERSION = "1" as const;
export const PLUGIN_LOCALIZATION_SCHEMA_VERSION = "1" as const;

export type CanonicalDecimalString = string;

export interface ChatTurnAdmissionInputV1 {
  readonly requestId: string;
  readonly requestFingerprint: string;
  readonly threadId: string;
  readonly turnId: string;
  readonly tenantId: string;
  readonly source: "signed_in_web_chat";
  readonly actor: PluginUserActor;
  readonly isReplay: false;
  readonly facts: Readonly<Record<string, JsonValue>>;
}

export interface ChatTurnAdmissionContextV1 {
  readonly signal: AbortSignal;
  readonly settings: Readonly<Record<string, JsonValue>>;
  /** Schema-restricted database facade already bound to the host transaction. */
  readonly database: TransactionBoundPluginDatabase;
  /** Audit writes join the same host transaction as admission and turn creation. */
  readonly audit: PluginAuditService;
}

export type ChatTurnAdmissionResultV1 =
  | Readonly<{
      decision: "approve";
      facts?: Readonly<Record<string, JsonValue>>;
    }>
  | Readonly<{
      decision: "reject";
      code: string;
      messageKey: string;
      parameters?: Readonly<Record<string, string>>;
      facts?: Readonly<Record<string, JsonValue>>;
    }>;

export interface ChatTurnAdmissionDefinitionV1 {
  readonly schemaVersion: typeof CHAT_TURN_ADMISSION_SCHEMA_VERSION;
  admit(
    input: ChatTurnAdmissionInputV1,
    context: ChatTurnAdmissionContextV1,
  ): Promise<ChatTurnAdmissionResultV1>;
}

export interface ChatComposerStatusValueV1 {
  readonly state: "ready" | "blocked" | "unavailable";
  readonly labelKey: string;
  readonly messageKey?: string;
  readonly parameters?: Readonly<Record<string, string>>;
  readonly facts?: Readonly<Record<string, JsonValue>>;
}

export interface ChatComposerStatusDefinitionV1 {
  readonly schemaVersion: typeof CHAT_COMPOSER_STATUS_SCHEMA_VERSION;
  read(context: {
    readonly tenantId: string;
    readonly actor: PluginUserActor;
    readonly signal: AbortSignal;
    readonly settings: Readonly<Record<string, JsonValue>>;
    readonly database: PluginDatabase;
  }): Promise<ChatComposerStatusValueV1>;
}

export interface SubjectLifecycleContextV1 {
  readonly signal: AbortSignal;
  readonly database: TransactionBoundPluginDatabase;
  readonly audit: PluginAuditService;
}

export interface SubjectLifecycleDefinitionV1 {
  readonly schemaVersion: typeof SUBJECT_LIFECYCLE_SCHEMA_VERSION;
  beforeUserDelete(
    input: Readonly<{ subjectId: string; actor: PluginActor }>,
    context: SubjectLifecycleContextV1,
  ): Promise<void>;
  removeTenantAttribution?(
    input: Readonly<{ tenantId: string; actor: PluginActor }>,
    context: SubjectLifecycleContextV1,
  ): Promise<void>;
}

export type AdminWorkspaceColumnFormat =
  | "text"
  | "decimal"
  | "timestamp"
  | "status";

export interface DeploymentAdminWorkspaceColumnV1 {
  readonly key: string;
  readonly labelKey: string;
  readonly format: AdminWorkspaceColumnFormat;
}

export interface DeploymentAdminWorkspaceFieldV1 {
  readonly key: string;
  readonly labelKey: string;
  readonly type: "text" | "integer" | "select" | "textarea";
  readonly required?: boolean;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly options?: ReadonlyArray<
    Readonly<{ value: string; labelKey: string }>
  >;
}

export interface DeploymentAdminWorkspaceRowActionV1 {
  readonly id: string;
  readonly actionId: string;
  readonly labelKey: string;
  readonly intent: "primary" | "neutral" | "danger";
  readonly fields?: readonly DeploymentAdminWorkspaceFieldV1[];
}

export interface DeploymentAdminWorkspaceTableV1 {
  readonly id: string;
  readonly titleKey: string;
  readonly routePath: `/${string}`;
  readonly rowIdKey: string;
  readonly columns: readonly DeploymentAdminWorkspaceColumnV1[];
  readonly rowActions?: readonly DeploymentAdminWorkspaceRowActionV1[];
}

export interface DeploymentAdminTableQueryV1 {
  readonly schemaVersion: "1";
  readonly query?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface DeploymentAdminTableRowV1 {
  readonly id: string;
  readonly values: Readonly<
    Record<string, JsonValue | DeploymentAdminLocalizedCellV1>
  >;
}

export interface DeploymentAdminLocalizedCellV1 {
  readonly messageKey: string;
  readonly parameters?: Readonly<Record<string, string>>;
}

export interface DeploymentAdminTableResultV1 {
  readonly schemaVersion: "1";
  readonly rows: readonly DeploymentAdminTableRowV1[];
  readonly nextCursor?: string;
}

export interface DeploymentAdminRowActionInputV1 {
  readonly schemaVersion: "1";
  readonly idempotencyKey: string;
  /** Host-authenticated HMAC over the actor, plugin, action, and canonical request payload. */
  readonly requestFingerprint: string;
  readonly rowId: string;
  readonly rowValues: Readonly<Record<string, JsonValue>>;
  readonly fields: Readonly<Record<string, JsonValue>>;
}

export interface DeploymentAdminWorkspaceV1 {
  readonly schemaVersion: typeof DEPLOYMENT_ADMIN_WORKSPACE_SCHEMA_VERSION;
  readonly titleKey: string;
  readonly descriptionKey?: string;
  readonly icon: string;
  readonly order?: number;
  readonly tables: readonly DeploymentAdminWorkspaceTableV1[];
}

export interface PluginLocalizationV1 {
  readonly schemaVersion: typeof PLUGIN_LOCALIZATION_SCHEMA_VERSION;
  readonly defaultLocale: string;
  readonly supportedLocales: readonly string[];
  readonly path: `./locales/${string}`;
}

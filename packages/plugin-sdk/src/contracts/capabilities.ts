export const PLUGIN_RISKS = [
  "read",
  "write",
  "destructive",
  "external",
] as const;
export const PLUGIN_PERMISSIONS = ["read", "use", "write", "manage"] as const;
export const PLUGIN_ROLES = ["viewer", "operator", "admin"] as const;
export const PLUGIN_TOOL_AUDIENCES = ["all", "coordinator", "general"] as const;
export const PLUGIN_WIDGET_TYPES = ["json", "kv", "table", "timeline"] as const;
export const PLUGIN_WIDGET_PLACEMENTS = [
  "plugins_page",
  "chat_thread",
] as const;

export type PluginRisk = (typeof PLUGIN_RISKS)[number];
export type PluginPermission = (typeof PLUGIN_PERMISSIONS)[number];
export type PluginRole = (typeof PLUGIN_ROLES)[number];
export type PluginToolAudience = (typeof PLUGIN_TOOL_AUDIENCES)[number];
export type PluginWidgetType = (typeof PLUGIN_WIDGET_TYPES)[number];
export type PluginWidgetPlacement = (typeof PLUGIN_WIDGET_PLACEMENTS)[number];

export interface PluginToolCapability {
  id: string;
  risk: PluginRisk;
  audience?: PluginToolAudience;
  requiredPermission?: PluginPermission;
}

export interface PluginActionCapability {
  id: string;
  risk: PluginRisk;
  requiredRole: PluginRole;
  deploymentAdminOnly?: boolean;
  formPlacement?: {
    moduleKey: string;
    recordType: string;
    intent: "primary" | "neutral" | "danger";
  };
}

export interface PluginScheduledJobCapability {
  id: string;
}

export interface PluginRouteCapability {
  path: `/${string}`;
  requiredRole: PluginRole;
}

export const PLUGIN_INGRESS_METHODS = [
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export type PluginIngressMethod = (typeof PLUGIN_INGRESS_METHODS)[number];

export interface PluginIngressRouteCapability {
  path: `/${string}`;
  methods: PluginIngressMethod[];
  auth: "api_token";
  requiredScopes: string[];
  maxRequestBytes: number;
}

export interface PluginWidgetCapability {
  id: string;
}

export interface PluginConnectionSelector {
  settingKey: string;
  integrationType: "imap_mailbox";
  access: "read";
  actionIds?: string[];
  scheduledJobIds?: string[];
}

export interface PluginStructuredClassificationCapability {
  readonly schemaVersion: "1";
  readonly actionIds?: string[];
  readonly scheduledJobIds?: string[];
}

export interface PluginKnowledgeCapability {
  /** Search and retrieve plugin-owned Knowledge. */
  read?: true;
  /** Create sources, upsert documents, and publish plugin-owned Knowledge. */
  write?: true;
  /** Delete documents from plugin-owned Knowledge. Independent of write. */
  delete?: true;
}

export interface PluginDeclaredCapabilities {
  dataInsightProvider?: boolean;
  tools?: PluginToolCapability[];
  actions?: PluginActionCapability[];
  scheduledJobs?: PluginScheduledJobCapability[];
  routes?: PluginRouteCapability[];
  ingressRoutes?: PluginIngressRouteCapability[];
  widgets?: PluginWidgetCapability[];
  tenantRecords?: { collections: string[] };
  database?: { mode: "plugin_schema" };
  objectStore?: { read?: boolean; write?: boolean };
  knowledge?: PluginKnowledgeCapability;
  connections?: { selectors: PluginConnectionSelector[] };
  structuredClassification?: PluginStructuredClassificationCapability;
  knowledgeEmailProcessor?: { schemaVersion: "1" };
  chatTurnAdmission?: { schemaVersion: "1"; scope: "deployment" };
  chatComposerStatus?: { schemaVersion: "1" };
  deploymentAdminWorkspace?: { schemaVersion: "1" };
  identityDirectory?: { read: true };
  audit?: { write: true };
  subjectLifecycle?: {
    schemaVersion: "1";
    userDeletion: true;
    tenantAttributionRemoval?: true;
  };
  localization?: { schemaVersion: "1" };
}

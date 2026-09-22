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
  /** Explicitly opt this tool into a verified embedded-chat invocation. */
  embeddedChat?: true;
  /** Closed, manifest-reviewed presentation that an embedded tool may request. */
  embeddedPresentation?: PluginEmbeddedToolPresentationCapability;
}

export interface PluginEmbeddedToolPresentationCapability {
  clientAction?: {
    target: string;
    labelKey: string;
    /** Permit one opaque resource-scoped reference for this fixed action. */
    resourceRef?: true;
  };
  suggestedFollowUpIds?: readonly [string, ...string[]];
}

/**
 * Requests a short-lived opaque authority reference for the named embedded
 * tools. The host grants it only for an active, verified embedded turn and
 * only to a deployment-approved managed package. It is not a user identity,
 * credential, grant, or reusable bearer token.
 */
export interface PluginEmbeddedDelegationCapability {
  schemaVersion: "1";
  toolIds: readonly [string, ...string[]];
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
  dataInsightAuthorization?: {
    namespace: string;
    inputField: string;
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

export type PluginStructuredClassificationBindingIds = readonly [
  string,
  ...string[],
];

/** Bind the broker to at least one declared action or scheduled job. */
export type PluginStructuredClassificationCapability = Readonly<
  { schemaVersion: "1" } & (
    | {
        actionIds: PluginStructuredClassificationBindingIds;
        scheduledJobIds?: PluginStructuredClassificationBindingIds;
      }
    | {
        actionIds?: PluginStructuredClassificationBindingIds;
        scheduledJobIds: PluginStructuredClassificationBindingIds;
      }
  )
>;

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
  embeddedDelegation?: PluginEmbeddedDelegationCapability;
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

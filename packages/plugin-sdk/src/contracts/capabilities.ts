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
}

export interface PluginScheduledJobCapability {
  id: string;
}

export interface PluginRouteCapability {
  path: `/${string}`;
  requiredRole: PluginRole;
}

export interface PluginWidgetCapability {
  id: string;
}

export interface PluginDeclaredCapabilities {
  tools?: PluginToolCapability[];
  actions?: PluginActionCapability[];
  scheduledJobs?: PluginScheduledJobCapability[];
  routes?: PluginRouteCapability[];
  widgets?: PluginWidgetCapability[];
  tenantRecords?: { collections: string[] };
}

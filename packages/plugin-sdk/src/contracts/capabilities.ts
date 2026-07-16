export const PLUGIN_CAPABILITIES = [
  "tools",
  "actions",
  "routes.read",
  "widgets",
  "scheduledJobs",
  "database.tenantRecords",
] as const;

export type PluginCapability = (typeof PLUGIN_CAPABILITIES)[number];

export function isPluginCapability(value: string): value is PluginCapability {
  return (PLUGIN_CAPABILITIES as readonly string[]).includes(value);
}

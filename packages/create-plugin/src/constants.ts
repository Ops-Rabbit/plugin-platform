export const CLI_VERSION = "0.7.1";
export const SDK_VERSION = "^0.7.1";
export const STARTER_IDS = [
  "basic-readonly",
  "operational-action",
  "scheduled-tenant-job",
  "database-tenant-records",
  "forms-workflow",
  "forms-insights",
  "service-ingress",
] as const;

export type StarterId = (typeof STARTER_IDS)[number];

export const STARTER_DESCRIPTIONS: Record<StarterId, string> = {
  "basic-readonly": "Read-only tool with the smallest public plugin surface.",
  "operational-action":
    "Operator write action with validated manifest permissions.",
  "scheduled-tenant-job": "Tenant-scoped scheduled work and cancellation.",
  "database-tenant-records":
    "Host-brokered tenant records without database credentials.",
  "forms-workflow":
    "Host-rendered Forms workflow, stages, actions, and analytics catalog.",
  "forms-insights":
    "Forms analytics catalog, editable Insights dashboard, and Records drill-through.",
  "service-ingress":
    "API-token ingress, plugin-schema migrations, and governed evidence uploads.",
};

export function isStarterId(value: string): value is StarterId {
  return (STARTER_IDS as readonly string[]).includes(value);
}

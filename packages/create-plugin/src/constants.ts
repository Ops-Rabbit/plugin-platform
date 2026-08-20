export const CLI_VERSION = "0.12.0";
export const SDK_VERSION = "^0.12.0";
export const STARTER_IDS = [
  "basic-readonly",
  "operational-action",
  "scheduled-tenant-job",
  "database-tenant-records",
  "forms-workflow",
  "forms-insights",
  "service-ingress",
  "knowledge-publisher",
  "knowledge-email-processor",
  "native-workspace",
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
  "knowledge-publisher":
    "Admin action that publishes tenant-scoped documents through the Knowledge broker.",
  "knowledge-email-processor":
    "Pure host-invoked processing for IMAP-derived Knowledge evidence and candidates.",
  "native-workspace":
    "Precompiled Forms workspace using the versioned browser mount contract.",
};

export function isStarterId(value: string): value is StarterId {
  return (STARTER_IDS as readonly string[]).includes(value);
}

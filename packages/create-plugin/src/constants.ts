export const CLI_VERSION = "0.3.0";
export const SDK_VERSION = "^0.3.0";
export const STARTER_IDS = [
  "basic-readonly",
  "operational-action",
  "scheduled-tenant-job",
  "database-tenant-records",
] as const;

export type StarterId = (typeof STARTER_IDS)[number];

export function isStarterId(value: string): value is StarterId {
  return (STARTER_IDS as readonly string[]).includes(value);
}

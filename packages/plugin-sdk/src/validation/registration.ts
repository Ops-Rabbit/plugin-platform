import type { PluginCapability } from "../contracts/capabilities.js";
import type { ValidationIssue } from "../contracts/errors.js";
import type { PluginRegistration } from "../contracts/registration.js";

const SECTIONS: ReadonlyArray<{
  key: keyof Pick<
    PluginRegistration,
    "tools" | "actions" | "scheduledJobs" | "routes" | "widgets"
  >;
  capability: PluginCapability;
}> = [
  { key: "tools", capability: "tools" },
  { key: "actions", capability: "actions" },
  { key: "scheduledJobs", capability: "scheduledJobs" },
  { key: "routes", capability: "routes.read" },
  { key: "widgets", capability: "widgets" },
];

export function validateRegistration(
  registration: PluginRegistration,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const declared = new Set(registration.manifest.capabilities);
  const registeredIds = new Set<string>();

  for (const { key, capability } of SECTIONS) {
    const definitions = registration[key] ?? [];
    if (definitions.length > 0 && !declared.has(capability)) {
      issues.push({
        path: `$.${key}`,
        code: "undeclared-capability",
        message: `${key} requires capability ${capability}.`,
      });
    }
    for (const [index, definition] of definitions.entries()) {
      const uniqueKey = `${key}:${definition.id}`;
      if (registeredIds.has(uniqueKey)) {
        issues.push({
          path: `$.${key}[${index}].id`,
          code: "duplicate",
          message: `Duplicate ${key} id ${definition.id}.`,
        });
      }
      registeredIds.add(uniqueKey);
    }
  }

  return issues;
}

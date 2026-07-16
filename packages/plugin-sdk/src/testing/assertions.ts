import { PluginValidationError } from "../contracts/errors.js";
import type { PluginManifest } from "../contracts/manifest.js";
import type { PluginDefinition } from "../contracts/registration.js";
import { validateManifest } from "../validation/manifest.js";
import { validateRegistration } from "../validation/registration.js";

export function assertValidPlugin(
  manifest: PluginManifest,
  definition: PluginDefinition,
): void {
  const manifestResult = validateManifest(manifest);
  const issues = [
    ...manifestResult.issues,
    ...validateRegistration(manifest, definition),
  ];
  if (issues.length > 0) throw new PluginValidationError(issues);
}

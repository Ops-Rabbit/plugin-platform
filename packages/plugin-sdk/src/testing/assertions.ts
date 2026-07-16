import type { PluginRegistration } from "../contracts/registration.js";
import { PluginValidationError } from "../contracts/errors.js";
import { validateManifest } from "../validation/manifest.js";
import { validateRegistration } from "../validation/registration.js";

export function assertValidPlugin(registration: PluginRegistration): void {
  const manifest = validateManifest(registration.manifest);
  const issues = [...manifest.issues, ...validateRegistration(registration)];
  if (issues.length > 0) throw new PluginValidationError(issues);
}

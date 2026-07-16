import {
  PLUGIN_WIDGET_PLACEMENTS,
  PLUGIN_WIDGET_TYPES,
} from "../contracts/capabilities.js";
import type { ValidationIssue } from "../contracts/errors.js";
import type { PluginManifest } from "../contracts/manifest.js";
import type { PluginDefinition } from "../contracts/registration.js";

const SECTIONS = [
  "tools",
  "actions",
  "scheduledJobs",
  "routes",
  "widgets",
] as const;

export function validateRegistration(
  manifest: PluginManifest,
  input: PluginDefinition,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!record(input))
    return [issue("$", "type", "Plugin entry must export an object.")];
  const definition = input as PluginDefinition;
  for (const key of Object.keys(input))
    if (!(SECTIONS as readonly string[]).includes(key))
      issues.push(
        issue(
          `$.${key}`,
          "unknown-property",
          `Unknown registration section: ${key}.`,
        ),
      );
  for (const section of SECTIONS)
    if (
      definition[section] !== undefined &&
      !Array.isArray(definition[section])
    )
      issues.push(
        issue(`$.${section}`, "type", `${section} must be an array.`),
      );
  if (issues.some(({ code }) => code === "type")) return issues;

  validateNamed("tools", manifest.capabilities.tools, definition.tools, issues);
  validateNamed(
    "actions",
    manifest.capabilities.actions,
    definition.actions,
    issues,
  );
  validateNamed(
    "scheduledJobs",
    manifest.capabilities.scheduledJobs,
    definition.scheduledJobs,
    issues,
  );
  validateNamed(
    "widgets",
    manifest.capabilities.widgets,
    definition.widgets,
    issues,
  );
  validateNamed(
    "routes",
    manifest.capabilities.routes,
    definition.routes,
    issues,
    "path",
  );

  const declaredTools = new Map(
    (manifest.capabilities.tools ?? []).map((entry) => [entry.id, entry]),
  );
  for (const [index, tool] of (definition.tools ?? []).entries()) {
    const declared = declaredTools.get(tool.id);
    if (
      declared &&
      (declared.risk !== tool.risk ||
        (declared.audience ?? "all") !== (tool.audience ?? "all") ||
        (declared.requiredPermission ?? "use") !==
          (tool.requiredPermission ?? "use"))
    ) {
      issues.push(
        issue(
          `$.tools[${index}]`,
          "metadata-mismatch",
          `Tool ${tool.id} security metadata differs from the manifest.`,
        ),
      );
    }
    if (
      typeof tool.description !== "string" ||
      !tool.description.trim() ||
      typeof tool.run !== "function"
    )
      issues.push(
        issue(
          `$.tools[${index}]`,
          "invalid-registration",
          `Tool ${tool.id} requires a description and run function.`,
        ),
      );
  }
  const declaredActions = new Map(
    (manifest.capabilities.actions ?? []).map((entry) => [entry.id, entry]),
  );
  for (const [index, action] of (definition.actions ?? []).entries()) {
    const declared = declaredActions.get(action.id);
    if (
      declared &&
      (declared.risk !== action.risk ||
        declared.requiredRole !== action.requiredRole ||
        Boolean(declared.deploymentAdminOnly) !==
          Boolean(action.deploymentAdminOnly))
    ) {
      issues.push(
        issue(
          `$.actions[${index}]`,
          "metadata-mismatch",
          `Action ${action.id} security metadata differs from the manifest.`,
        ),
      );
    }
    if (
      typeof action.title !== "string" ||
      !action.title.trim() ||
      typeof action.run !== "function"
    )
      issues.push(
        issue(
          `$.actions[${index}]`,
          "invalid-registration",
          `Action ${action.id} requires a title and run function.`,
        ),
      );
  }
  const declaredRoutes = new Map(
    (manifest.capabilities.routes ?? []).map((entry) => [entry.path, entry]),
  );
  for (const [index, route] of (definition.routes ?? []).entries()) {
    if (declaredRoutes.get(route.path)?.requiredRole !== route.requiredRole)
      issues.push(
        issue(
          `$.routes[${index}]`,
          "metadata-mismatch",
          `Route ${route.path} role differs from the manifest.`,
        ),
      );
    if (typeof route.handle !== "function")
      issues.push(
        issue(
          `$.routes[${index}].handle`,
          "invalid-registration",
          `Route ${route.path} requires a handle function.`,
        ),
      );
  }
  for (const [index, job] of (definition.scheduledJobs ?? []).entries()) {
    if (
      !Number.isInteger(job.intervalSeconds) ||
      job.intervalSeconds < 1 ||
      (job.timeoutSeconds !== undefined &&
        (!Number.isInteger(job.timeoutSeconds) || job.timeoutSeconds < 1)) ||
      typeof job.run !== "function"
    ) {
      issues.push(
        issue(
          `$.scheduledJobs[${index}]`,
          "invalid-registration",
          `Job ${job.id} requires positive integer timing and a run function.`,
        ),
      );
    }
  }
  const routePaths = new Set(
    (definition.routes ?? []).map((route) => route.path),
  );
  for (const [index, widget] of (definition.widgets ?? []).entries()) {
    if (!routePaths.has(widget.routePath))
      issues.push(
        issue(
          `$.widgets[${index}].routePath`,
          "missing-route",
          `Widget ${widget.id} references unregistered route ${widget.routePath}.`,
        ),
      );
    if (
      widget.type !== undefined &&
      !(PLUGIN_WIDGET_TYPES as readonly string[]).includes(widget.type)
    )
      issues.push(
        issue(
          `$.widgets[${index}].type`,
          "invalid-registration",
          `Widget ${widget.id} has an invalid type.`,
        ),
      );
    if (
      widget.placement !== undefined &&
      !(PLUGIN_WIDGET_PLACEMENTS as readonly string[]).includes(
        widget.placement,
      )
    )
      issues.push(
        issue(
          `$.widgets[${index}].placement`,
          "invalid-registration",
          `Widget ${widget.id} has an invalid placement.`,
        ),
      );
  }
  return issues;
}

function validateNamed(
  section: string,
  declared: ReadonlyArray<object> | undefined,
  registered: ReadonlyArray<object> | undefined,
  issues: ValidationIssue[],
  key = "id",
): void {
  const declaredIds = new Set(
    (declared ?? []).map((entry) =>
      String((entry as Record<string, unknown>)[key]),
    ),
  );
  const seen = new Set<string>();
  for (const [index, entry] of (registered ?? []).entries()) {
    if (!record(entry)) {
      issues.push(
        issue(
          `$.${section}[${index}]`,
          "type",
          `${section} registration must be an object.`,
        ),
      );
      continue;
    }
    const id = String(entry[key] ?? "").trim();
    if (!id)
      issues.push(
        issue(
          `$.${section}[${index}].${key}`,
          "required",
          `${section} ${key} is required.`,
        ),
      );
    else if (seen.has(id))
      issues.push(
        issue(
          `$.${section}[${index}].${key}`,
          "duplicate",
          `Duplicate ${section} ${id}.`,
        ),
      );
    else if (!declaredIds.has(id))
      issues.push(
        issue(
          `$.${section}[${index}].${key}`,
          "undeclared-capability",
          `${section} ${id} is not declared in the manifest.`,
        ),
      );
    seen.add(id);
  }
  for (const id of declaredIds)
    if (!seen.has(id))
      issues.push(
        issue(
          `$.${section}`,
          "missing-registration",
          `Manifest declares ${section} ${id}, but the entry does not register it.`,
        ),
      );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

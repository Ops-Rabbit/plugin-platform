import { isPluginCapability } from "../contracts/capabilities.js";
import type { ValidationIssue } from "../contracts/errors.js";
import {
  PLUGIN_API_VERSION,
  type PluginManifest,
} from "../contracts/manifest.js";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ENTRY_PATTERN = /^\.\/dist\/[A-Za-z0-9._/-]+\.js$/;
const ALLOWED_KEYS = new Set([
  "id",
  "name",
  "version",
  "description",
  "apiVersion",
  "main",
  "capabilities",
  "minimumOpsRabbitVersion",
  "publisher",
]);

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: ValidationIssue[];
}

export function validateManifest(
  input: unknown,
): ValidationResult<PluginManifest> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        { path: "$", code: "type", message: "Manifest must be an object." },
      ],
    };
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      issues.push({
        path: `$.${key}`,
        code: "unknown-property",
        message: `Unknown manifest property: ${key}.`,
      });
    }
  }

  requireString(
    input,
    "id",
    issues,
    (value) => ID_PATTERN.test(value),
    "Use lowercase kebab-case.",
  );
  requireString(input, "name", issues);
  requireString(input, "description", issues);
  maximumLength(input, "name", 100, issues);
  maximumLength(input, "description", 500, issues);
  requireString(
    input,
    "version",
    issues,
    (value) => VERSION_PATTERN.test(value),
    "Use semantic version x.y.z.",
  );
  requireString(
    input,
    "main",
    issues,
    isSafeEntry,
    "Entry must be a relative compiled JavaScript path under ./dist/.",
  );
  if (input.minimumOpsRabbitVersion !== undefined) {
    requireString(
      input,
      "minimumOpsRabbitVersion",
      issues,
      (value) => VERSION_PATTERN.test(value),
      "minimumOpsRabbitVersion must use semantic version x.y.z.",
    );
  }

  if (input.apiVersion !== PLUGIN_API_VERSION) {
    issues.push({
      path: "$.apiVersion",
      code: "unsupported",
      message: `Supported plugin API version is ${PLUGIN_API_VERSION}.`,
    });
  }

  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) {
    issues.push({
      path: "$.capabilities",
      code: "required",
      message: "Declare at least one capability.",
    });
  } else {
    const seen = new Set<string>();
    for (const [index, capability] of input.capabilities.entries()) {
      if (typeof capability !== "string" || !isPluginCapability(capability)) {
        issues.push({
          path: `$.capabilities[${index}]`,
          code: "unsupported",
          message: `Unknown capability: ${String(capability)}.`,
        });
      } else if (seen.has(capability)) {
        issues.push({
          path: `$.capabilities[${index}]`,
          code: "duplicate",
          message: `Capability ${capability} is duplicated.`,
        });
      }
      if (typeof capability === "string") seen.add(capability);
    }
  }
  if (input.publisher !== undefined) validatePublisher(input.publisher, issues);

  return issues.length === 0
    ? { ok: true, value: input as unknown as PluginManifest, issues }
    : { ok: false, issues };
}

function isSafeEntry(value: string): boolean {
  return (
    ENTRY_PATTERN.test(value) &&
    !value
      .split("/")
      .slice(1)
      .some((segment) => segment === "." || segment === "..")
  );
}

function maximumLength(
  object: Record<string, unknown>,
  key: string,
  limit: number,
  issues: ValidationIssue[],
): void {
  const value = object[key];
  if (typeof value === "string" && value.length > limit) {
    issues.push({
      path: `$.${key}`,
      code: "too-long",
      message: `${key} must be at most ${limit} characters.`,
    });
  }
}

function validatePublisher(value: unknown, issues: ValidationIssue[]): void {
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    value.name.trim() === ""
  ) {
    issues.push({
      path: "$.publisher",
      code: "invalid",
      message: "Publisher must contain a non-empty name.",
    });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!new Set(["name", "url"]).has(key)) {
      issues.push({
        path: `$.publisher.${key}`,
        code: "unknown-property",
        message: `Unknown publisher property: ${key}.`,
      });
    }
  }
  if (value.url !== undefined) {
    try {
      if (typeof value.url !== "string")
        throw new Error("URL must be a string");
      const url = new URL(value.url);
      if (!new Set(["https:", "http:"]).has(url.protocol))
        throw new Error("unsupported protocol");
    } catch {
      issues.push({
        path: "$.publisher.url",
        code: "invalid",
        message: "Publisher URL must be an HTTP(S) URL.",
      });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  object: Record<string, unknown>,
  key: string,
  issues: ValidationIssue[],
  predicate: (value: string) => boolean = () => true,
  detail = "Value must be a non-empty string.",
): void {
  const value = object[key];
  if (typeof value !== "string" || value.trim() === "" || !predicate(value)) {
    issues.push({ path: `$.${key}`, code: "invalid", message: detail });
  }
}

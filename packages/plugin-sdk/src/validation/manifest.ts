import {
  PLUGIN_PERMISSIONS,
  PLUGIN_RISKS,
  PLUGIN_ROLES,
  PLUGIN_TOOL_AUDIENCES,
  type PluginDeclaredCapabilities,
} from "../contracts/capabilities.js";
import type { ValidationIssue } from "../contracts/errors.js";
import {
  PLUGIN_API_VERSION,
  PLUGIN_NAVIGATION_ICONS,
  type PluginManifest,
} from "../contracts/manifest.js";

const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ENTRY = /^\.\/dist\/[A-Za-z0-9._/-]+\.js$/;
const COLLECTION = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const TOP_LEVEL = new Set([
  "id",
  "name",
  "version",
  "description",
  "apiVersion",
  "main",
  "minimumOpsRabbitVersion",
  "publisher",
  "settings",
  "navigation",
  "formStarterPack",
  "capabilities",
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
  if (!record(input))
    return {
      ok: false,
      issues: [issue("$", "type", "Manifest must be an object.")],
    };
  unknownKeys(input, TOP_LEVEL, "$", issues);
  string(
    input.id,
    "$.id",
    issues,
    (v) => ID.test(v),
    "Use lowercase letters, numbers, hyphens, or underscores.",
  );
  string(input.name, "$.name", issues, undefined, "Name is required.", 100);
  string(
    input.description,
    "$.description",
    issues,
    undefined,
    "Description is required.",
    500,
  );
  string(
    input.version,
    "$.version",
    issues,
    (v) => VERSION.test(v),
    "Use semantic version x.y.z.",
  );
  string(
    input.main,
    "$.main",
    issues,
    safeEntry,
    "Entry must be a safe relative JavaScript path under ./dist/.",
  );
  if (input.apiVersion !== PLUGIN_API_VERSION)
    issues.push(
      issue(
        "$.apiVersion",
        "unsupported",
        `Supported plugin API version is ${PLUGIN_API_VERSION}.`,
      ),
    );
  if (input.minimumOpsRabbitVersion !== undefined)
    string(
      input.minimumOpsRabbitVersion,
      "$.minimumOpsRabbitVersion",
      issues,
      (v) => VERSION.test(v),
      "Use semantic version x.y.z.",
    );
  validatePublisher(input.publisher, issues);
  validateSettings(input.settings, issues);
  validateNavigation(input.navigation, input.settings, issues);
  validateFormStarterPackReference(
    input.formStarterPack,
    input.navigation,
    issues,
  );
  validateCapabilities(input.capabilities, issues);
  return issues.length === 0
    ? { ok: true, value: input as unknown as PluginManifest, issues }
    : { ok: false, issues };
}

function validateFormStarterPackReference(
  value: unknown,
  navigationValue: unknown,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(
      issue(
        "$.formStarterPack",
        "type",
        "Form starter-pack reference must be an object.",
      ),
    );
    return;
  }
  unknownKeys(
    value,
    new Set(["moduleKey", "path"]),
    "$.formStarterPack",
    issues,
  );
  string(
    value.moduleKey,
    "$.formStarterPack.moduleKey",
    issues,
    (entry) => COLLECTION.test(entry),
    "Use lowercase snake_case.",
  );
  string(
    value.path,
    "$.formStarterPack.path",
    issues,
    (entry) => /^\.\/forms\/[a-z][a-z0-9_-]*\.json$/.test(entry),
    "Use a safe relative JSON path directly under ./forms/.",
  );
  if (!record(navigationValue) || navigationValue.kind !== "forms_workspace") {
    issues.push(
      issue(
        "$.formStarterPack",
        "invalid",
        "A form starter pack requires forms_workspace navigation.",
      ),
    );
  } else if (
    typeof value.moduleKey === "string" &&
    typeof navigationValue.moduleKey === "string" &&
    value.moduleKey !== navigationValue.moduleKey
  ) {
    issues.push(
      issue(
        "$.formStarterPack.moduleKey",
        "invalid",
        "Starter-pack and navigation module keys must match.",
      ),
    );
  }
}

function validateNavigation(
  value: unknown,
  settingsValue: unknown,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(issue("$.navigation", "type", "Navigation must be an object."));
    return;
  }
  unknownKeys(
    value,
    new Set([
      "kind",
      "moduleKey",
      "path",
      "icon",
      "fallbackTitle",
      "titleSetting",
      "iconSetting",
      "order",
    ]),
    "$.navigation",
    issues,
  );
  if (value.kind !== "forms_workspace")
    issues.push(
      issue(
        "$.navigation.kind",
        "unsupported",
        "Navigation kind must be forms_workspace.",
      ),
    );
  string(
    value.moduleKey,
    "$.navigation.moduleKey",
    issues,
    (entry) => COLLECTION.test(entry),
    "Use lowercase snake_case.",
  );
  string(
    value.path,
    "$.navigation.path",
    issues,
    (entry) => /^\/apps\/[a-z][a-z0-9_-]*$/.test(entry),
    "Use /apps/<module> without traversal or query segments.",
  );
  member(value.icon, PLUGIN_NAVIGATION_ICONS, "$.navigation.icon", issues);
  string(
    value.fallbackTitle,
    "$.navigation.fallbackTitle",
    issues,
    undefined,
    "Fallback title is required.",
    100,
  );
  if (
    value.order !== undefined &&
    (typeof value.order !== "number" || !Number.isFinite(value.order))
  )
    issues.push(
      issue(
        "$.navigation.order",
        "type",
        "Navigation order must be a finite number.",
      ),
    );

  const settings = Array.isArray(settingsValue)
    ? new Map(
        settingsValue.filter(record).map((setting) => [setting.key, setting]),
      )
    : new Map<unknown, Record<string, unknown>>();
  for (const [field, expectedType] of [
    ["titleSetting", "string"],
    ["iconSetting", "select"],
  ] as const) {
    const key = value[field];
    if (key === undefined) continue;
    if (typeof key !== "string" || !COLLECTION.test(key)) {
      issues.push(
        issue(
          `$.navigation.${field}`,
          "invalid",
          `${field} must be a setting key.`,
        ),
      );
      continue;
    }
    const setting = settings.get(key);
    if (!setting || setting.type !== expectedType)
      issues.push(
        issue(
          `$.navigation.${field}`,
          "invalid",
          `${field} must reference a declared ${expectedType} setting.`,
        ),
      );
    if (
      field === "iconSetting" &&
      setting &&
      (!Array.isArray(setting.options) ||
        setting.options.some(
          (icon) =>
            !PLUGIN_NAVIGATION_ICONS.some((supported) => supported === icon),
        ))
    )
      issues.push(
        issue(
          "$.navigation.iconSetting",
          "invalid",
          "iconSetting options must use supported navigation icons.",
        ),
      );
  }
}

function validateCapabilities(value: unknown, issues: ValidationIssue[]): void {
  if (!record(value)) {
    issues.push(
      issue("$.capabilities", "type", "Capabilities must be an object."),
    );
    return;
  }
  const allowed = new Set([
    "tools",
    "actions",
    "scheduledJobs",
    "routes",
    "widgets",
    "tenantRecords",
  ]);
  unknownKeys(value, allowed, "$.capabilities", issues);
  const capabilities = value as PluginDeclaredCapabilities;
  namedArray(
    capabilities.tools,
    "tools",
    issues,
    ["id", "risk", "audience", "requiredPermission"],
    (entry, path) => {
      member(entry.risk, PLUGIN_RISKS, `${path}.risk`, issues);
      optionalMember(
        entry.audience,
        PLUGIN_TOOL_AUDIENCES,
        `${path}.audience`,
        issues,
      );
      optionalMember(
        entry.requiredPermission,
        PLUGIN_PERMISSIONS,
        `${path}.requiredPermission`,
        issues,
      );
    },
  );
  namedArray(
    capabilities.actions,
    "actions",
    issues,
    ["id", "risk", "requiredRole", "deploymentAdminOnly"],
    (entry, path) => {
      member(entry.risk, PLUGIN_RISKS, `${path}.risk`, issues);
      member(entry.requiredRole, PLUGIN_ROLES, `${path}.requiredRole`, issues);
      if (
        entry.deploymentAdminOnly !== undefined &&
        typeof entry.deploymentAdminOnly !== "boolean"
      )
        issues.push(
          issue(
            `${path}.deploymentAdminOnly`,
            "type",
            "deploymentAdminOnly must be boolean.",
          ),
        );
    },
  );
  namedArray(capabilities.scheduledJobs, "scheduledJobs", issues, ["id"]);
  namedArray(capabilities.widgets, "widgets", issues, ["id"]);
  namedArray(
    capabilities.routes,
    "routes",
    issues,
    ["path", "requiredRole"],
    (entry, path) => {
      if (typeof entry.path !== "string" || !safeRoute(entry.path))
        issues.push(
          issue(
            `${path}.path`,
            "invalid",
            "Route must begin with / and contain no traversal segments.",
          ),
        );
      member(entry.requiredRole, PLUGIN_ROLES, `${path}.requiredRole`, issues);
    },
    "path",
  );
  if (capabilities.tenantRecords !== undefined) {
    if (!record(capabilities.tenantRecords)) {
      issues.push(
        issue(
          "$.capabilities.tenantRecords",
          "type",
          "tenantRecords must be an object.",
        ),
      );
      return;
    }
    unknownKeys(
      capabilities.tenantRecords as unknown as Record<string, unknown>,
      new Set(["collections"]),
      "$.capabilities.tenantRecords",
      issues,
    );
    const collections = capabilities.tenantRecords?.collections;
    if (!Array.isArray(collections) || collections.length === 0)
      issues.push(
        issue(
          "$.capabilities.tenantRecords.collections",
          "required",
          "Declare at least one tenant-record collection.",
        ),
      );
    else
      uniqueStrings(
        collections,
        "$.capabilities.tenantRecords.collections",
        issues,
        COLLECTION,
      );
  }
  const surfaceCount = [
    capabilities.tools,
    capabilities.actions,
    capabilities.scheduledJobs,
    capabilities.routes,
    capabilities.widgets,
  ].reduce((sum, entries) => sum + (entries?.length ?? 0), 0);
  if (surfaceCount === 0 && !capabilities.tenantRecords)
    issues.push(
      issue("$.capabilities", "required", "Declare at least one capability."),
    );
}

function namedArray<T extends object>(
  value: T[] | undefined,
  section: string,
  issues: ValidationIssue[],
  allowedKeys: string[],
  validate?: (entry: T, path: string) => void,
  key = "id",
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(
      issue(
        `$.capabilities.${section}`,
        "required",
        `${section} must contain at least one declaration.`,
      ),
    );
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const path = `$.capabilities.${section}[${index}]`;
    if (!record(entry))
      return issues.push(
        issue(path, "type", "Capability declaration must be an object."),
      );
    const identifier = entry[key];
    unknownKeys(entry, new Set(allowedKeys), path, issues);
    if (
      typeof identifier !== "string" ||
      (key === "id" ? !ID.test(identifier) : !safeRoute(identifier))
    )
      issues.push(
        issue(`${path}.${key}`, "invalid", `Invalid ${section} ${key}.`),
      );
    else if (seen.has(identifier))
      issues.push(
        issue(
          `${path}.${key}`,
          "duplicate",
          `Duplicate ${section} ${identifier}.`,
        ),
      );
    else seen.add(identifier);
    validate?.(entry as T, path);
  });
}

function validatePublisher(value: unknown, issues: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(issue("$.publisher", "type", "Publisher must be an object."));
    return;
  }
  unknownKeys(value, new Set(["name", "url"]), "$.publisher", issues);
  string(
    value.name,
    "$.publisher.name",
    issues,
    undefined,
    "Publisher name is required.",
  );
  if (value.url !== undefined)
    string(
      value.url,
      "$.publisher.url",
      issues,
      httpUrl,
      "Publisher URL must use HTTP(S).",
    );
}

function validateSettings(value: unknown, issues: ValidationIssue[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.push(issue("$.settings", "type", "Settings must be an array."));
    return;
  }
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const path = `$.settings[${index}]`;
    if (!record(entry)) {
      issues.push(issue(path, "type", "Setting must be an object."));
      return;
    }
    unknownKeys(
      entry,
      new Set([
        "key",
        "label",
        "type",
        "description",
        "required",
        "default",
        "options",
        "minimum",
        "maximum",
      ]),
      path,
      issues,
    );
    if (typeof entry.key !== "string" || !COLLECTION.test(entry.key))
      issues.push(
        issue(
          `${path}.key`,
          "invalid",
          "Setting key must use lowercase snake_case.",
        ),
      );
    else if (seen.has(entry.key))
      issues.push(
        issue(`${path}.key`, "duplicate", `Duplicate setting ${entry.key}.`),
      );
    else seen.add(entry.key);
    string(
      entry.label,
      `${path}.label`,
      issues,
      undefined,
      "Setting label is required.",
    );
    member(
      entry.type,
      [
        "string",
        "number",
        "boolean",
        "select",
        "string_list",
        "secret",
        "json",
      ] as const,
      `${path}.type`,
      issues,
    );
    if (entry.type === "secret" && entry.default !== undefined)
      issues.push(
        issue(
          `${path}.default`,
          "forbidden",
          "Secret settings cannot have defaults.",
        ),
      );
    if (
      entry.type === "select" &&
      (!Array.isArray(entry.options) || entry.options.length === 0)
    )
      issues.push(
        issue(
          `${path}.options`,
          "required",
          "Select settings require options.",
        ),
      );
  });
}

function unknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.has(key))
      issues.push(
        issue(
          `${path}.${key}`,
          "unknown-property",
          `Unknown property: ${key}.`,
        ),
      );
}
function uniqueStrings(
  values: unknown[],
  path: string,
  issues: ValidationIssue[],
  pattern: RegExp,
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (typeof value !== "string" || !pattern.test(value))
      issues.push(issue(`${path}[${index}]`, "invalid", "Invalid value."));
    else if (seen.has(value))
      issues.push(
        issue(`${path}[${index}]`, "duplicate", `Duplicate value ${value}.`),
      );
    else seen.add(value);
  });
}
function string(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  predicate?: (value: string) => boolean,
  message = "Value must be a non-empty string.",
  max?: number,
): void {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    (predicate && !predicate(value))
  )
    issues.push(issue(path, "invalid", message));
  else if (max && value.length > max)
    issues.push(
      issue(path, "too-long", `Value must be at most ${max} characters.`),
    );
}
function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[],
): void {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  )
    issues.push(
      issue(path, "invalid", `Value must be one of: ${allowed.join(", ")}.`),
    );
}
function optionalMember<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[],
): void {
  if (value !== undefined) member(value, allowed, path, issues);
}
function safeEntry(value: string): boolean {
  return (
    ENTRY.test(value) &&
    !value
      .split("/")
      .slice(1)
      .some((part) => part === "." || part === "..")
  );
}
function safeRoute(value: string): boolean {
  return (
    /^\/[A-Za-z0-9._/-]+$/.test(value) &&
    !value.split("/").some((part) => part === "." || part === "..")
  );
}
function httpUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

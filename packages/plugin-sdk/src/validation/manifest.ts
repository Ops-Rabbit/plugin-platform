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
import {
  PLUGIN_FRONTEND_CAPABILITIES,
  PLUGIN_FRONTEND_SDK_VERSION,
} from "../contracts/frontend.js";

const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ENTRY = /^\.\/dist\/[A-Za-z0-9._/-]+\.js$/;
const COLLECTION = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const ENTITLEMENT = /^[a-z][a-z0-9_]{0,79}$/;
const SCOPE = /^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$/;
const TOP_LEVEL = new Set([
  "id",
  "name",
  "version",
  "description",
  "apiVersion",
  "main",
  "minimumOpsRabbitVersion",
  "publisher",
  "requiredEntitlements",
  "database",
  "dataInsight",
  "settings",
  "navigation",
  "frontend",
  "adminWorkspace",
  "localization",
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
  validateRequiredEntitlements(input.requiredEntitlements, issues);
  validateDatabase(input.database, input.capabilities, issues);
  validateDataInsight(
    input.dataInsight,
    input.capabilities,
    input.settings,
    input.navigation,
    issues,
  );
  if (
    input.database === undefined &&
    record(input.capabilities) &&
    input.capabilities.database !== undefined
  ) {
    issues.push(
      issue(
        "$.capabilities.database",
        "invalid",
        "The plugin_schema capability requires a database migrations declaration.",
      ),
    );
  }
  validateSettings(input.settings, issues);
  validateNavigation(input.navigation, input.settings, issues);
  validateFrontend(
    input.frontend,
    input.navigation,
    input.formStarterPack,
    issues,
  );
  validateFormStarterPackReference(
    input.formStarterPack,
    input.navigation,
    issues,
  );
  validateAdminWorkspace(input.adminWorkspace, input.capabilities, issues);
  validateLocalization(input.localization, input.capabilities, issues);
  validateCapabilities(input.capabilities, issues);
  validateInteractionDependencies(input.capabilities, issues);
  if (record(input.capabilities) && Array.isArray(input.capabilities.actions)) {
    for (const [index, action] of input.capabilities.actions.entries()) {
      if (
        record(action) &&
        record(action.formPlacement) &&
        (!record(input.navigation) ||
          typeof input.navigation.moduleKey !== "string" ||
          action.formPlacement.moduleKey !== input.navigation.moduleKey)
      ) {
        issues.push(
          issue(
            `$.capabilities.actions[${index}].formPlacement.moduleKey`,
            "invalid",
            "Form action placement must use the plugin navigation module.",
          ),
        );
      }
    }
  }
  return issues.length === 0
    ? { ok: true, value: input as unknown as PluginManifest, issues }
    : { ok: false, issues };
}

function validateInteractionDependencies(
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (!record(value)) return;
  const requireCapabilities = (source: string, required: string[]) => {
    if (value[source] === undefined) return;
    for (const dependency of required)
      if (value[dependency] === undefined)
        issues.push(
          issue(
            `$.capabilities.${source}`,
            "invalid",
            `${source} requires the ${dependency} capability.`,
          ),
        );
  };
  requireCapabilities("chatTurnAdmission", [
    "database",
    "audit",
    "localization",
  ]);
  requireCapabilities("chatComposerStatus", ["database", "localization"]);
  requireCapabilities("deploymentAdminWorkspace", [
    "identityDirectory",
    "localization",
  ]);
  requireCapabilities("subjectLifecycle", ["database", "audit"]);
}

function validateFrontend(
  value: unknown,
  navigationValue: unknown,
  starterPackValue: unknown,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(issue("$.frontend", "type", "Frontend must be an object."));
    return;
  }
  unknownKeys(
    value,
    new Set([
      "kind",
      "entry",
      "styles",
      "assets",
      "sdkVersion",
      "mountIsolation",
      "capabilities",
    ]),
    "$.frontend",
    issues,
  );
  if (value.kind !== "native_workspace")
    issues.push(
      issue(
        "$.frontend.kind",
        "unsupported",
        "Frontend kind must be native_workspace.",
      ),
    );
  if (value.sdkVersion !== PLUGIN_FRONTEND_SDK_VERSION)
    issues.push(
      issue(
        "$.frontend.sdkVersion",
        "unsupported",
        `Supported frontend SDK version is ${PLUGIN_FRONTEND_SDK_VERSION}.`,
      ),
    );
  if (value.mountIsolation !== "shadow_dom")
    issues.push(
      issue(
        "$.frontend.mountIsolation",
        "unsupported",
        "Native workspaces must use shadow_dom isolation.",
      ),
    );
  string(
    value.entry,
    "$.frontend.entry",
    issues,
    (entry) => safeFrontendFile(entry, ".js"),
    "Use a safe relative JavaScript file under ./dist/.",
  );
  validateFrontendFiles(value.styles, "styles", ".css", 8, issues);
  validateFrontendAssets(value.assets, issues);
  if (!Array.isArray(value.capabilities)) {
    issues.push(
      issue(
        "$.frontend.capabilities",
        "type",
        "Frontend capabilities must be an array.",
      ),
    );
  } else {
    uniqueStrings(
      value.capabilities,
      "$.frontend.capabilities",
      issues,
      /^[a-z][a-z.]+$/,
    );
    for (const [index, capability] of value.capabilities.entries())
      member(
        capability,
        PLUGIN_FRONTEND_CAPABILITIES,
        `$.frontend.capabilities[${index}]`,
        issues,
      );
  }
  if (!record(navigationValue) || navigationValue.kind !== "forms_workspace")
    issues.push(
      issue(
        "$.frontend",
        "invalid",
        "A native workspace requires forms_workspace navigation.",
      ),
    );
  if (!record(starterPackValue))
    issues.push(
      issue(
        "$.frontend",
        "invalid",
        "A native workspace requires a Forms starter pack owned by its navigation module.",
      ),
    );
}

function validateFrontendFiles(
  value: unknown,
  field: string,
  extension: string,
  maximum: number,
  issues: ValidationIssue[],
): void {
  const path = `$.frontend.${field}`;
  if (!Array.isArray(value) || value.length > maximum) {
    issues.push(
      issue(
        path,
        "invalid",
        `${field} must contain at most ${maximum} entries.`,
      ),
    );
    return;
  }
  uniqueStrings(value, path, issues, /^\.\/dist\/[A-Za-z0-9._/-]+$/);
  for (const [index, entry] of value.entries())
    if (typeof entry === "string" && !safeFrontendFile(entry, extension))
      issues.push(
        issue(
          `${path}[${index}]`,
          "invalid",
          `Use a safe relative ${extension} file under ./dist/.`,
        ),
      );
}

function validateFrontendAssets(
  value: unknown,
  issues: ValidationIssue[],
): void {
  const path = "$.frontend.assets";
  if (!Array.isArray(value) || value.length > 16) {
    issues.push(
      issue(path, "invalid", "assets must contain at most 16 entries."),
    );
    return;
  }
  uniqueStrings(value, path, issues, /^\.\/dist\/assets\/[A-Za-z0-9._/*-]+$/);
  for (const [index, entry] of value.entries())
    if (
      typeof entry === "string" &&
      (!/^\.\/dist\/assets\/[A-Za-z0-9._/*-]+$/.test(entry) ||
        !entry.endsWith("/**") ||
        entry.slice(0, -3).includes("*") ||
        entry.includes(".."))
    )
      issues.push(
        issue(
          `${path}[${index}]`,
          "invalid",
          "Use a safe relative /** glob under ./dist/assets/.",
        ),
      );
}

function safeFrontendFile(value: string, extension: string): boolean {
  return (
    /^\.\/dist\/[A-Za-z0-9._/-]+$/.test(value) &&
    value.endsWith(extension) &&
    !value.endsWith(".map") &&
    !value.includes("..") &&
    !value.includes(":") &&
    !value.includes("?") &&
    !value.includes("#")
  );
}

function validateDataInsight(
  value: unknown,
  capabilitiesValue: unknown,
  settingsValue: unknown,
  navigationValue: unknown,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(
      issue(
        "$.dataInsight",
        "type",
        "Data Insight declaration must be an object.",
      ),
    );
    return;
  }
  unknownKeys(
    value,
    new Set(["catalogRoute", "templatesRoute", "workspace"]),
    "$.dataInsight",
    issues,
  );
  string(
    value.catalogRoute,
    "$.dataInsight.catalogRoute",
    issues,
    safeRoute,
    "Use a safe absolute route path.",
  );
  const routes =
    record(capabilitiesValue) && Array.isArray(capabilitiesValue.routes)
      ? capabilitiesValue.routes
      : [];
  if (!hasViewerRoute(routes, value.catalogRoute))
    issues.push(
      issue(
        "$.dataInsight.catalogRoute",
        "invalid",
        "Data Insight catalog route must be declared as a read route capability.",
      ),
    );
  if (value.templatesRoute !== undefined) {
    string(
      value.templatesRoute,
      "$.dataInsight.templatesRoute",
      issues,
      safeRoute,
      "Use a safe absolute route path.",
    );
    if (!hasViewerRoute(routes, value.templatesRoute)) {
      issues.push(
        issue(
          "$.dataInsight.templatesRoute",
          "invalid",
          "Data Insight templates route must be declared as a read route capability.",
        ),
      );
    }
  }
  validateDataInsightWorkspace(
    value.workspace,
    value.templatesRoute,
    settingsValue,
    navigationValue,
    issues,
  );
}

function hasViewerRoute(routes: unknown[], path: unknown): boolean {
  return routes.some(
    (route) =>
      record(route) && route.path === path && route.requiredRole === "viewer",
  );
}

function validateDataInsightWorkspace(
  value: unknown,
  templatesRoute: unknown,
  settingsValue: unknown,
  navigationValue: unknown,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(
      issue(
        "$.dataInsight.workspace",
        "type",
        "Workspace declaration must be an object.",
      ),
    );
    return;
  }
  unknownKeys(
    value,
    new Set([
      "enabledSetting",
      "placement",
      "defaultTemplateId",
      "defaultTab",
      "allowUserDefault",
    ]),
    "$.dataInsight.workspace",
    issues,
  );
  if (templatesRoute === undefined) {
    issues.push(
      issue(
        "$.dataInsight.workspace",
        "invalid",
        "Workspace Insights requires a templates route.",
      ),
    );
  }
  if (!record(navigationValue) || navigationValue.kind !== "forms_workspace") {
    issues.push(
      issue(
        "$.dataInsight.workspace",
        "invalid",
        "Workspace Insights requires Forms workspace navigation.",
      ),
    );
  }
  if (value.placement !== "tab" && value.placement !== "menu") {
    issues.push(
      issue(
        "$.dataInsight.workspace.placement",
        "invalid",
        "Placement must be tab or menu.",
      ),
    );
  }
  string(
    value.defaultTemplateId,
    "$.dataInsight.workspace.defaultTemplateId",
    issues,
    (item) => ID.test(item),
    "Use a safe template id.",
  );
  if (
    value.defaultTab !== undefined &&
    value.defaultTab !== "records" &&
    value.defaultTab !== "insights"
  ) {
    issues.push(
      issue(
        "$.dataInsight.workspace.defaultTab",
        "invalid",
        "Default tab must be records or insights.",
      ),
    );
  }
  if (value.placement === "menu" && value.defaultTab !== undefined) {
    issues.push(
      issue(
        "$.dataInsight.workspace.defaultTab",
        "invalid",
        "Menu placement does not use a default tab.",
      ),
    );
  }
  if (value.placement === "menu" && value.allowUserDefault !== undefined) {
    issues.push(
      issue(
        "$.dataInsight.workspace.allowUserDefault",
        "invalid",
        "Menu placement does not use a default-tab preference.",
      ),
    );
  }
  if (
    value.allowUserDefault !== undefined &&
    typeof value.allowUserDefault !== "boolean"
  ) {
    issues.push(
      issue(
        "$.dataInsight.workspace.allowUserDefault",
        "type",
        "allowUserDefault must be boolean.",
      ),
    );
  }
  if (value.enabledSetting !== undefined) {
    string(
      value.enabledSetting,
      "$.dataInsight.workspace.enabledSetting",
      issues,
      (item) => ID.test(item),
      "Use a safe setting key.",
    );
    const settings = Array.isArray(settingsValue) ? settingsValue : [];
    const setting = settings.find(
      (item) => record(item) && item.key === value.enabledSetting,
    );
    if (!record(setting) || setting.type !== "boolean") {
      issues.push(
        issue(
          "$.dataInsight.workspace.enabledSetting",
          "invalid",
          "Enabled setting must reference a declared boolean setting.",
        ),
      );
    }
  }
}

function validateDatabase(
  value: unknown,
  capabilitiesValue: unknown,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(
      issue("$.database", "type", "Database declaration must be an object."),
    );
    return;
  }
  unknownKeys(value, new Set(["migrationsPath"]), "$.database", issues);
  string(
    value.migrationsPath,
    "$.database.migrationsPath",
    issues,
    (entry) => /^\.\/migrations\/[a-z][a-z0-9_-]*$/.test(entry),
    "Use a safe directory directly under ./migrations/.",
  );
  if (
    !record(capabilitiesValue) ||
    !record(capabilitiesValue.database) ||
    capabilitiesValue.database.mode !== "plugin_schema"
  ) {
    issues.push(
      issue(
        "$.database",
        "invalid",
        "Database migrations require the plugin_schema database capability.",
      ),
    );
  }
}

function validateRequiredEntitlements(
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
    issues.push(
      issue(
        "$.requiredEntitlements",
        "invalid",
        "Required entitlements must contain between 1 and 16 entries.",
      ),
    );
    return;
  }
  uniqueStrings(value, "$.requiredEntitlements", issues, ENTITLEMENT);
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
      "workflow",
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
  validateFormsWorkflow(value.workflow, settings, issues);
}

function validateFormsWorkflow(
  value: unknown,
  settings: Map<unknown, Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(
      issue("$.navigation.workflow", "type", "Workflow must be an object."),
    );
    return;
  }
  unknownKeys(
    value,
    new Set(["rootStarterKey", "stageModelSetting", "recordNumber"]),
    "$.navigation.workflow",
    issues,
  );
  string(
    value.rootStarterKey,
    "$.navigation.workflow.rootStarterKey",
    issues,
    (entry) => COLLECTION.test(entry),
    "Use lowercase snake_case.",
  );
  validateSettingReference(
    value.stageModelSetting,
    "$.navigation.workflow.stageModelSetting",
    "json",
    settings,
    issues,
  );
  if (value.recordNumber === undefined) return;
  if (!record(value.recordNumber)) {
    issues.push(
      issue(
        "$.navigation.workflow.recordNumber",
        "type",
        "Record number must be an object.",
      ),
    );
    return;
  }
  unknownKeys(
    value.recordNumber,
    new Set(["prefixSetting", "digitsSetting"]),
    "$.navigation.workflow.recordNumber",
    issues,
  );
  validateSettingReference(
    value.recordNumber.prefixSetting,
    "$.navigation.workflow.recordNumber.prefixSetting",
    "string",
    settings,
    issues,
  );
  validateSettingReference(
    value.recordNumber.digitsSetting,
    "$.navigation.workflow.recordNumber.digitsSetting",
    "number",
    settings,
    issues,
  );
}

function validateSettingReference(
  value: unknown,
  path: string,
  expectedType: string,
  settings: Map<unknown, Record<string, unknown>>,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || !COLLECTION.test(value)) {
    issues.push(issue(path, "invalid", "Value must be a setting key."));
    return;
  }
  if (settings.get(value)?.type !== expectedType)
    issues.push(
      issue(
        path,
        "invalid",
        `Value must reference a declared ${expectedType} setting.`,
      ),
    );
}

function validateCapabilities(value: unknown, issues: ValidationIssue[]): void {
  if (!record(value)) {
    issues.push(
      issue("$.capabilities", "type", "Capabilities must be an object."),
    );
    return;
  }
  const allowed = new Set([
    "dataInsightProvider",
    "tools",
    "actions",
    "scheduledJobs",
    "routes",
    "ingressRoutes",
    "widgets",
    "tenantRecords",
    "database",
    "objectStore",
    "knowledge",
    "knowledgeEmailProcessor",
    "chatTurnAdmission",
    "chatComposerStatus",
    "deploymentAdminWorkspace",
    "identityDirectory",
    "audit",
    "subjectLifecycle",
    "localization",
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
    capabilities.ingressRoutes,
    "ingressRoutes",
    issues,
    ["path", "methods", "auth", "requiredScopes", "maxRequestBytes"],
    (entry, path) => {
      if (typeof entry.path !== "string" || !safeRoute(entry.path))
        issues.push(
          issue(
            `${path}.path`,
            "invalid",
            "Ingress route must be a safe absolute path.",
          ),
        );
      if (!Array.isArray(entry.methods) || entry.methods.length === 0)
        issues.push(
          issue(
            `${path}.methods`,
            "required",
            "Declare at least one ingress method.",
          ),
        );
      else
        uniqueStrings(
          entry.methods,
          `${path}.methods`,
          issues,
          /^(POST|PUT|PATCH|DELETE)$/,
        );
      if (entry.auth !== "api_token")
        issues.push(
          issue(
            `${path}.auth`,
            "invalid",
            "Ingress routes require api_token authentication.",
          ),
        );
      if (
        !Array.isArray(entry.requiredScopes) ||
        entry.requiredScopes.length === 0
      )
        issues.push(
          issue(
            `${path}.requiredScopes`,
            "required",
            "Declare at least one token scope.",
          ),
        );
      else
        uniqueStrings(
          entry.requiredScopes,
          `${path}.requiredScopes`,
          issues,
          SCOPE,
        );
      if (
        !Number.isInteger(entry.maxRequestBytes) ||
        Number(entry.maxRequestBytes) < 1 ||
        Number(entry.maxRequestBytes) > 1_048_576
      )
        issues.push(
          issue(
            `${path}.maxRequestBytes`,
            "invalid",
            "Request limit must be between 1 and 1048576 bytes.",
          ),
        );
    },
    "path",
  );
  namedArray(
    capabilities.actions,
    "actions",
    issues,
    ["id", "risk", "requiredRole", "deploymentAdminOnly", "formPlacement"],
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
      if (entry.formPlacement !== undefined) {
        if (!record(entry.formPlacement)) {
          issues.push(
            issue(
              `${path}.formPlacement`,
              "type",
              "Form placement must be an object.",
            ),
          );
        } else {
          unknownKeys(
            entry.formPlacement,
            new Set(["moduleKey", "recordType", "intent"]),
            `${path}.formPlacement`,
            issues,
          );
          string(
            entry.formPlacement.moduleKey,
            `${path}.formPlacement.moduleKey`,
            issues,
            (candidate) => COLLECTION.test(candidate),
            "Use lowercase snake_case.",
          );
          string(
            entry.formPlacement.recordType,
            `${path}.formPlacement.recordType`,
            issues,
            (candidate) => COLLECTION.test(candidate),
            "Use lowercase snake_case.",
          );
          member(
            entry.formPlacement.intent,
            ["primary", "neutral", "danger"] as const,
            `${path}.formPlacement.intent`,
            issues,
          );
        }
      }
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
  validateSingletonCapability(
    capabilities.database,
    "database",
    ["mode"],
    issues,
    (entry) => {
      if (entry.mode !== "plugin_schema")
        issues.push(
          issue(
            "$.capabilities.database.mode",
            "invalid",
            "Database mode must be plugin_schema.",
          ),
        );
    },
  );
  for (const [name, singleton] of [
    ["chatTurnAdmission", capabilities.chatTurnAdmission],
    ["chatComposerStatus", capabilities.chatComposerStatus],
    ["deploymentAdminWorkspace", capabilities.deploymentAdminWorkspace],
    ["localization", capabilities.localization],
  ] as const)
    validateSingletonCapability(
      singleton,
      name,
      ["schemaVersion", ...(name === "chatTurnAdmission" ? ["scope"] : [])],
      issues,
      (entry) => {
        if (entry.schemaVersion !== "1")
          issues.push(
            issue(
              `$.capabilities.${name}.schemaVersion`,
              "invalid",
              `${name} schema version must be 1.`,
            ),
          );
        if (name === "chatTurnAdmission" && entry.scope !== "deployment")
          issues.push(
            issue(
              "$.capabilities.chatTurnAdmission.scope",
              "invalid",
              "Chat admission scope must be deployment.",
            ),
          );
      },
    );
  validateSingletonCapability(
    capabilities.identityDirectory,
    "identityDirectory",
    ["read"],
    issues,
    (entry) => {
      if (entry.read !== true)
        issues.push(
          issue(
            "$.capabilities.identityDirectory.read",
            "invalid",
            "Identity directory read access must be explicitly enabled.",
          ),
        );
    },
  );
  validateSingletonCapability(
    capabilities.audit,
    "audit",
    ["write"],
    issues,
    (entry) => {
      if (entry.write !== true)
        issues.push(
          issue(
            "$.capabilities.audit.write",
            "invalid",
            "Audit write access must be explicitly enabled.",
          ),
        );
    },
  );
  validateSingletonCapability(
    capabilities.subjectLifecycle,
    "subjectLifecycle",
    ["schemaVersion", "userDeletion", "tenantAttributionRemoval"],
    issues,
    (entry) => {
      if (entry.schemaVersion !== "1")
        issues.push(
          issue(
            "$.capabilities.subjectLifecycle.schemaVersion",
            "invalid",
            "Subject lifecycle schema version must be 1.",
          ),
        );
      if (entry.userDeletion !== true)
        issues.push(
          issue(
            "$.capabilities.subjectLifecycle.userDeletion",
            "invalid",
            "User deletion handling must be explicitly enabled.",
          ),
        );
      if (
        entry.tenantAttributionRemoval !== undefined &&
        entry.tenantAttributionRemoval !== true
      )
        issues.push(
          issue(
            "$.capabilities.subjectLifecycle.tenantAttributionRemoval",
            "invalid",
            "tenantAttributionRemoval must be true when declared.",
          ),
        );
    },
  );
  validateSingletonCapability(
    capabilities.objectStore,
    "objectStore",
    ["read", "write"],
    issues,
    (entry) => {
      for (const key of ["read", "write"] as const)
        if (entry[key] !== undefined && typeof entry[key] !== "boolean")
          issues.push(
            issue(
              `$.capabilities.objectStore.${key}`,
              "type",
              `${key} must be boolean.`,
            ),
          );
      if (entry.read !== true && entry.write !== true)
        issues.push(
          issue(
            "$.capabilities.objectStore",
            "invalid",
            "Enable read, write, or both.",
          ),
        );
    },
  );
  validateSingletonCapability(
    capabilities.knowledge,
    "knowledge",
    ["write"],
    issues,
    (entry) => {
      if (entry.write !== true)
        issues.push(
          issue(
            "$.capabilities.knowledge.write",
            "invalid",
            "Knowledge write access must be explicitly enabled.",
          ),
        );
    },
  );
  validateSingletonCapability(
    capabilities.knowledgeEmailProcessor,
    "knowledgeEmailProcessor",
    ["schemaVersion"],
    issues,
    (entry) => {
      if (entry.schemaVersion !== "1")
        issues.push(
          issue(
            "$.capabilities.knowledgeEmailProcessor.schemaVersion",
            "invalid",
            "Knowledge email processor schema version must be 1.",
          ),
        );
    },
  );
  const surfaceCount = [
    capabilities.tools,
    capabilities.actions,
    capabilities.scheduledJobs,
    capabilities.routes,
    capabilities.ingressRoutes,
    capabilities.widgets,
  ].reduce((sum, entries) => sum + (entries?.length ?? 0), 0);
  if (
    surfaceCount === 0 &&
    !capabilities.tenantRecords &&
    !capabilities.database &&
    !capabilities.objectStore &&
    !capabilities.knowledge &&
    !capabilities.knowledgeEmailProcessor &&
    !capabilities.chatTurnAdmission &&
    !capabilities.chatComposerStatus &&
    !capabilities.deploymentAdminWorkspace &&
    !capabilities.identityDirectory &&
    !capabilities.audit &&
    !capabilities.subjectLifecycle &&
    !capabilities.localization
  )
    issues.push(
      issue("$.capabilities", "required", "Declare at least one capability."),
    );
}

function validateLocalization(
  value: unknown,
  capabilitiesValue: unknown,
  issues: ValidationIssue[],
): void {
  const declared =
    record(capabilitiesValue) && capabilitiesValue.localization !== undefined;
  if (value === undefined) {
    if (declared)
      issues.push(
        issue(
          "$.localization",
          "required",
          "The localization capability requires a localization declaration.",
        ),
      );
    return;
  }
  if (!declared)
    issues.push(
      issue(
        "$.localization",
        "invalid",
        "Localization must be declared as a capability.",
      ),
    );
  if (!record(value)) {
    issues.push(
      issue("$.localization", "type", "Localization must be an object."),
    );
    return;
  }
  unknownKeys(
    value,
    new Set(["schemaVersion", "defaultLocale", "supportedLocales", "path"]),
    "$.localization",
    issues,
  );
  if (value.schemaVersion !== "1")
    issues.push(
      issue(
        "$.localization.schemaVersion",
        "invalid",
        "Localization schema version must be 1.",
      ),
    );
  string(
    value.defaultLocale,
    "$.localization.defaultLocale",
    issues,
    (v) => /^[a-z]{2}(?:-[A-Z]{2})?$/.test(v),
    "Use a locale such as en or en-US.",
  );
  if (
    !Array.isArray(value.supportedLocales) ||
    value.supportedLocales.length === 0
  )
    issues.push(
      issue(
        "$.localization.supportedLocales",
        "required",
        "Declare at least one supported locale.",
      ),
    );
  else {
    uniqueStrings(
      value.supportedLocales,
      "$.localization.supportedLocales",
      issues,
      /^[a-z]{2}(?:-[A-Z]{2})?$/,
    );
    if (
      typeof value.defaultLocale === "string" &&
      !value.supportedLocales.includes(value.defaultLocale)
    )
      issues.push(
        issue(
          "$.localization.defaultLocale",
          "invalid",
          "Default locale must be supported.",
        ),
      );
  }
  string(
    value.path,
    "$.localization.path",
    issues,
    (v) => /^\.\/locales\/[A-Za-z0-9._/-]+$/.test(v) && !v.includes(".."),
    "Use a safe relative path under ./locales/.",
  );
}

function validateAdminWorkspace(
  value: unknown,
  capabilitiesValue: unknown,
  issues: ValidationIssue[],
): void {
  const capabilities = record(capabilitiesValue) ? capabilitiesValue : {};
  const declared = capabilities.deploymentAdminWorkspace !== undefined;
  if (value === undefined) {
    if (declared)
      issues.push(
        issue(
          "$.adminWorkspace",
          "required",
          "The admin workspace capability requires an adminWorkspace declaration.",
        ),
      );
    return;
  }
  if (!declared)
    issues.push(
      issue(
        "$.adminWorkspace",
        "invalid",
        "Admin workspace must be declared as a capability.",
      ),
    );
  if (!record(value)) {
    issues.push(
      issue("$.adminWorkspace", "type", "Admin workspace must be an object."),
    );
    return;
  }
  unknownKeys(
    value,
    new Set([
      "schemaVersion",
      "titleKey",
      "descriptionKey",
      "icon",
      "order",
      "tables",
    ]),
    "$.adminWorkspace",
    issues,
  );
  if (value.schemaVersion !== "1")
    issues.push(
      issue(
        "$.adminWorkspace.schemaVersion",
        "invalid",
        "Admin workspace schema version must be 1.",
      ),
    );
  string(
    value.titleKey,
    "$.adminWorkspace.titleKey",
    issues,
    (v) => SCOPE.test(v),
    "Use a localization message key.",
  );
  if (value.descriptionKey !== undefined)
    string(
      value.descriptionKey,
      "$.adminWorkspace.descriptionKey",
      issues,
      (v) => SCOPE.test(v),
      "Use a localization message key.",
    );
  member(value.icon, PLUGIN_NAVIGATION_ICONS, "$.adminWorkspace.icon", issues);
  if (
    value.order !== undefined &&
    (!Number.isFinite(value.order) || !Number.isInteger(value.order))
  )
    issues.push(
      issue("$.adminWorkspace.order", "type", "Order must be an integer."),
    );
  if (!Array.isArray(value.tables) || value.tables.length === 0) {
    issues.push(
      issue(
        "$.adminWorkspace.tables",
        "required",
        "Declare at least one admin table.",
      ),
    );
    return;
  }
  const routes = new Map(
    (Array.isArray(capabilities.routes) ? capabilities.routes : [])
      .filter(record)
      .map((entry) => [entry.path, entry]),
  );
  const actions = new Map(
    (Array.isArray(capabilities.actions) ? capabilities.actions : [])
      .filter(record)
      .map((entry) => [entry.id, entry]),
  );
  const tableIds = new Set<string>();
  for (const [index, table] of value.tables.entries()) {
    const path = `$.adminWorkspace.tables[${index}]`;
    if (!record(table)) {
      issues.push(issue(path, "type", "Admin table must be an object."));
      continue;
    }
    unknownKeys(
      table,
      new Set([
        "id",
        "titleKey",
        "routePath",
        "rowIdKey",
        "columns",
        "rowActions",
      ]),
      path,
      issues,
    );
    string(
      table.id,
      `${path}.id`,
      issues,
      (v) => ID.test(v),
      "Use a plugin identifier.",
    );
    if (typeof table.id === "string") {
      if (tableIds.has(table.id))
        issues.push(
          issue(`${path}.id`, "duplicate", "Table ids must be unique."),
        );
      tableIds.add(table.id);
    }
    string(
      table.titleKey,
      `${path}.titleKey`,
      issues,
      (v) => SCOPE.test(v),
      "Use a localization message key.",
    );
    string(
      table.rowIdKey,
      `${path}.rowIdKey`,
      issues,
      (v) => COLLECTION.test(v),
      "Use lowercase snake_case.",
    );
    const route = routes.get(table.routePath);
    if (!route || route.requiredRole !== "admin")
      issues.push(
        issue(
          `${path}.routePath`,
          "invalid",
          "Admin table must reference a declared admin route.",
        ),
      );
    if (!Array.isArray(table.columns) || table.columns.length === 0)
      issues.push(
        issue(`${path}.columns`, "required", "Declare at least one column."),
      );
    else validateAdminColumns(table.columns, `${path}.columns`, issues);
    const rowActionIds = new Set<string>();
    for (const [actionIndex, rowAction] of (Array.isArray(table.rowActions)
      ? table.rowActions
      : []
    ).entries()) {
      const actionPath = `${path}.rowActions[${actionIndex}]`;
      if (!record(rowAction)) {
        issues.push(issue(actionPath, "type", "Row action must be an object."));
        continue;
      }
      unknownKeys(
        rowAction,
        new Set(["id", "actionId", "labelKey", "intent", "fields"]),
        actionPath,
        issues,
      );
      string(
        rowAction.id,
        `${actionPath}.id`,
        issues,
        (v) => ID.test(v),
        "Use a plugin identifier.",
      );
      string(
        rowAction.labelKey,
        `${actionPath}.labelKey`,
        issues,
        (v) => SCOPE.test(v),
        "Use a localization message key.",
      );
      member(
        rowAction.intent,
        ["primary", "neutral", "danger"] as const,
        `${actionPath}.intent`,
        issues,
      );
      if (typeof rowAction.id === "string") {
        if (rowActionIds.has(rowAction.id))
          issues.push(
            issue(
              `${actionPath}.id`,
              "duplicate",
              "Row action ids must be unique.",
            ),
          );
        rowActionIds.add(rowAction.id);
      }
      const action = actions.get(rowAction.actionId);
      if (
        !action ||
        action.requiredRole !== "admin" ||
        action.deploymentAdminOnly !== true
      )
        issues.push(
          issue(
            `${actionPath}.actionId`,
            "invalid",
            "Row action must reference a deployment-admin-only admin action.",
          ),
        );
      if (rowAction.fields !== undefined)
        validateAdminFields(rowAction.fields, `${actionPath}.fields`, issues);
    }
  }
}

function validateAdminColumns(
  value: unknown[],
  path: string,
  issues: ValidationIssue[],
): void {
  const keys = new Set<string>();
  for (const [index, column] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!record(column)) {
      issues.push(issue(itemPath, "type", "Column must be an object."));
      continue;
    }
    unknownKeys(
      column,
      new Set(["key", "labelKey", "format"]),
      itemPath,
      issues,
    );
    string(
      column.key,
      `${itemPath}.key`,
      issues,
      (v) => COLLECTION.test(v),
      "Use lowercase snake_case.",
    );
    string(
      column.labelKey,
      `${itemPath}.labelKey`,
      issues,
      (v) => SCOPE.test(v),
      "Use a localization message key.",
    );
    member(
      column.format,
      ["text", "decimal", "timestamp", "status"] as const,
      `${itemPath}.format`,
      issues,
    );
    if (typeof column.key === "string") {
      if (keys.has(column.key))
        issues.push(
          issue(`${itemPath}.key`, "duplicate", "Column keys must be unique."),
        );
      keys.add(column.key);
    }
  }
}

function validateAdminFields(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "type", "Fields must be an array."));
    return;
  }
  const keys = new Set<string>();
  for (const [index, field] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!record(field)) {
      issues.push(issue(itemPath, "type", "Field must be an object."));
      continue;
    }
    unknownKeys(
      field,
      new Set([
        "key",
        "labelKey",
        "type",
        "required",
        "minimum",
        "maximum",
        "options",
      ]),
      itemPath,
      issues,
    );
    string(
      field.key,
      `${itemPath}.key`,
      issues,
      (v) => COLLECTION.test(v),
      "Use lowercase snake_case.",
    );
    string(
      field.labelKey,
      `${itemPath}.labelKey`,
      issues,
      (v) => SCOPE.test(v),
      "Use a localization message key.",
    );
    member(
      field.type,
      ["text", "integer", "select", "textarea"] as const,
      `${itemPath}.type`,
      issues,
    );
    if (field.required !== undefined && typeof field.required !== "boolean")
      issues.push(
        issue(`${itemPath}.required`, "type", "required must be boolean."),
      );
    for (const bound of ["minimum", "maximum"] as const)
      if (field[bound] !== undefined && !Number.isSafeInteger(field[bound]))
        issues.push(
          issue(
            `${itemPath}.${bound}`,
            "type",
            `${bound} must be a safe integer.`,
          ),
        );
    if (
      typeof field.minimum === "number" &&
      typeof field.maximum === "number" &&
      field.minimum > field.maximum
    )
      issues.push(
        issue(itemPath, "invalid", "minimum must not exceed maximum."),
      );
    if (
      field.type === "select" &&
      (!Array.isArray(field.options) || field.options.length === 0)
    )
      issues.push(
        issue(
          `${itemPath}.options`,
          "required",
          "Select fields require options.",
        ),
      );
    else if (field.type === "select" && Array.isArray(field.options)) {
      const values = new Set<string>();
      for (const [optionIndex, option] of field.options.entries()) {
        const optionPath = `${itemPath}.options[${optionIndex}]`;
        if (!record(option)) {
          issues.push(issue(optionPath, "type", "Option must be an object."));
          continue;
        }
        unknownKeys(option, new Set(["value", "labelKey"]), optionPath, issues);
        string(
          option.value,
          `${optionPath}.value`,
          issues,
          undefined,
          "Option value is required.",
        );
        string(
          option.labelKey,
          `${optionPath}.labelKey`,
          issues,
          (v) => SCOPE.test(v),
          "Use a localization message key.",
        );
        if (typeof option.value === "string") {
          if (values.has(option.value))
            issues.push(
              issue(
                `${optionPath}.value`,
                "duplicate",
                "Option values must be unique.",
              ),
            );
          values.add(option.value);
        }
      }
    } else if (field.options !== undefined)
      issues.push(
        issue(
          `${itemPath}.options`,
          "invalid",
          "Only select fields may declare options.",
        ),
      );
    if (typeof field.key === "string") {
      if (keys.has(field.key))
        issues.push(
          issue(`${itemPath}.key`, "duplicate", "Field keys must be unique."),
        );
      keys.add(field.key);
    }
  }
}

function validateSingletonCapability(
  value: unknown,
  name: string,
  keys: string[],
  issues: ValidationIssue[],
  validate: (entry: Record<string, unknown>) => void,
): void {
  if (value === undefined) return;
  if (!record(value)) {
    issues.push(
      issue(`$.capabilities.${name}`, "type", `${name} must be an object.`),
    );
    return;
  }
  unknownKeys(value, new Set(keys), `$.capabilities.${name}`, issues);
  validate(value);
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

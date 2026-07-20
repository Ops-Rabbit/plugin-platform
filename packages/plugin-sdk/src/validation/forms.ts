import type { ValidationIssue } from "../contracts/errors.js";
import {
  FORM_FIELD_TYPES,
  FORM_ICON_KEYS,
  FORM_STARTER_PACK_FORMAT_VERSION,
  type FormStarterPackAsset,
} from "../contracts/forms.js";

const KEY = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const SYSTEM_COLUMNS = new Set([
  "system_ticket_number",
  "system_record_id",
  "system_title",
  "system_status",
  "system_workflow_stage",
  "system_created_at",
  "system_submitted_at",
  "system_updated_at",
]);

export function validateFormStarterPack(input: unknown): {
  ok: boolean;
  value?: FormStarterPackAsset;
  issues: ValidationIssue[];
} {
  const issues: ValidationIssue[] = [];
  if (!record(input)) {
    return {
      ok: false,
      issues: [issue("$", "type", "Starter pack must be an object.")],
    };
  }
  unknownKeys(input, ["formatVersion", "moduleKey", "starters"], "$", issues);
  if (input.formatVersion !== FORM_STARTER_PACK_FORMAT_VERSION) {
    issues.push(
      issue(
        "$.formatVersion",
        "unsupported",
        `Supported starter-pack format is ${FORM_STARTER_PACK_FORMAT_VERSION}.`,
      ),
    );
  }
  key(input.moduleKey, "$.moduleKey", issues);
  if (
    !Array.isArray(input.starters) ||
    input.starters.length === 0 ||
    input.starters.length > 100
  ) {
    issues.push(
      issue(
        "$.starters",
        "required",
        "Starter pack must contain between 1 and 100 starters.",
      ),
    );
  } else {
    const starterKeys = new Set<string>();
    const recordTypes = new Set<string>();
    input.starters.forEach((starter, index) =>
      validateStarter(starter, index, starterKeys, recordTypes, issues),
    );
  }
  return issues.length === 0
    ? { ok: true, value: input as unknown as FormStarterPackAsset, issues }
    : { ok: false, issues };
}

function validateStarter(
  value: unknown,
  index: number,
  starterKeys: Set<string>,
  recordTypes: Set<string>,
  issues: ValidationIssue[],
) {
  const path = `$.starters[${index}]`;
  if (!record(value))
    return issues.push(issue(path, "type", "Starter must be an object."));
  unknownKeys(
    value,
    [
      "starterKey",
      "title",
      "description",
      "recordType",
      "badge",
      "icon",
      "schema",
      "listConfig",
    ],
    path,
    issues,
  );
  uniqueKey(value.starterKey, `${path}.starterKey`, starterKeys, issues);
  uniqueKey(value.recordType, `${path}.recordType`, recordTypes, issues);
  boundedString(value.title, `${path}.title`, 120, issues);
  boundedString(value.description, `${path}.description`, 500, issues);
  boundedString(value.badge, `${path}.badge`, 50, issues);
  member(value.icon, FORM_ICON_KEYS, `${path}.icon`, issues);
  validateSchema(value.schema, `${path}.schema`, issues);
  validateListConfig(
    value.listConfig,
    `${path}.listConfig`,
    value.schema,
    issues,
  );
}

function validateSchema(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) {
  if (!record(value))
    return issues.push(issue(path, "type", "Schema must be an object."));
  unknownKeys(value, ["fields", "sections", "actions"], path, issues);
  const fields = Array.isArray(value.fields) ? value.fields : [];
  if (fields.length === 0 || fields.length > 200)
    issues.push(
      issue(
        `${path}.fields`,
        "required",
        "Schema must contain between 1 and 200 fields.",
      ),
    );
  const fieldKeys = new Set<string>();
  fields.forEach((field, index) =>
    validateField(field, `${path}.fields[${index}]`, fieldKeys, issues),
  );
  const sections = Array.isArray(value.sections) ? value.sections : [];
  if (sections.length === 0 || sections.length > 50)
    issues.push(
      issue(
        `${path}.sections`,
        "required",
        "Schema must contain between 1 and 50 sections.",
      ),
    );
  const sectionKeys = new Set<string>();
  sections.forEach((section, index) =>
    validateSection(
      section,
      `${path}.sections[${index}]`,
      sectionKeys,
      fieldKeys,
      issues,
    ),
  );
  const actions = Array.isArray(value.actions) ? value.actions : [];
  if (actions.length === 0 || actions.length > 10)
    issues.push(
      issue(
        `${path}.actions`,
        "required",
        "Schema must contain between 1 and 10 actions.",
      ),
    );
  const actionKeys = new Set<string>();
  actions.forEach((action, index) =>
    validateAction(action, `${path}.actions[${index}]`, actionKeys, issues),
  );
}

function validateField(
  value: unknown,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
) {
  if (!record(value))
    return issues.push(issue(path, "type", "Field must be an object."));
  unknownKeys(
    value,
    [
      "key",
      "label",
      "type",
      "required",
      "placeholder",
      "helpText",
      "options",
      "optionSource",
      "listColumn",
      "summaryField",
      "attachmentMultiple",
    ],
    path,
    issues,
  );
  uniqueKey(value.key, `${path}.key`, seen, issues);
  boundedString(value.label, `${path}.label`, 120, issues);
  member(value.type, FORM_FIELD_TYPES, `${path}.type`, issues);
  optionalBooleanFields(
    value,
    ["required", "listColumn", "summaryField", "attachmentMultiple"],
    path,
    issues,
  );
  optionalBoundedString(value.placeholder, `${path}.placeholder`, 300, issues);
  optionalBoundedString(value.helpText, `${path}.helpText`, 500, issues);
  if (value.type === "select") {
    const staticOptions = Array.isArray(value.options) ? value.options : null;
    const hasOptions = staticOptions !== null;
    const hasOptionSource = value.optionSource !== undefined;
    if (
      !hasOptions &&
      !hasOptionSource
    ) {
      issues.push(
        issue(
          `${path}.options`,
          "required",
          "Select fields require static options or an optionSource.",
        ),
      );
    }
    if (hasOptions && (
      staticOptions.length === 0 ||
      staticOptions.length > 100
    )) {
      issues.push(
        issue(
          `${path}.options`,
          "required",
          "Select fields require between 1 and 100 options.",
        ),
      );
    } else if (hasOptions) {
      const optionValues = new Set<string>();
      staticOptions.forEach((option, index) => {
        const optionPath = `${path}.options[${index}]`;
        if (!record(option))
          return issues.push(
            issue(optionPath, "type", "Option must be an object."),
          );
        unknownKeys(option, ["value", "label"], optionPath, issues);
        uniqueKey(option.value, `${optionPath}.value`, optionValues, issues);
        boundedString(option.label, `${optionPath}.label`, 120, issues);
      });
    }
    if (hasOptionSource) {
      validateOptionSource(value.optionSource, `${path}.optionSource`, issues);
    }
  } else if (value.options !== undefined) {
    issues.push(
      issue(
        `${path}.options`,
        "forbidden",
        "Only select fields may declare options.",
      ),
    );
  }
  if (value.optionSource !== undefined && value.type !== "select") {
    issues.push(
      issue(
        `${path}.optionSource`,
        "forbidden",
        "Only select fields may declare an optionSource.",
      ),
    );
  }
  if (value.attachmentMultiple !== undefined && value.type !== "attachment") {
    issues.push(
      issue(
        `${path}.attachmentMultiple`,
        "forbidden",
        "attachmentMultiple is valid only for attachment fields.",
      ),
    );
  }
}

function validateOptionSource(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
) {
  if (!record(value)) {
    issues.push(issue(path, "type", "optionSource must be an object."));
    return;
  }
  unknownKeys(value, ["kind", "route", "dependsOn"], path, issues);
  if (value.kind !== "plugin_route") {
    issues.push(
      issue(`${path}.kind`, "unsupported", "optionSource kind must be plugin_route."),
    );
  }
  if (typeof value.route !== "string" || !/^\/?[-/a-z0-9_]+$/u.test(value.route) || value.route.includes("..")) {
    issues.push(
      issue(`${path}.route`, "invalid", "optionSource route must be a safe plugin route path."),
    );
  }
  if (value.dependsOn !== undefined) {
    if (!Array.isArray(value.dependsOn) || value.dependsOn.some((entry) => typeof entry !== "string" || !/^[a-z][a-z0-9_]*$/u.test(entry))) {
      issues.push(
        issue(`${path}.dependsOn`, "invalid", "optionSource dependsOn must list form field keys."),
      );
    }
  }
}

function validateSection(
  value: unknown,
  path: string,
  seen: Set<string>,
  fields: Set<string>,
  issues: ValidationIssue[],
) {
  if (!record(value))
    return issues.push(issue(path, "type", "Section must be an object."));
  unknownKeys(
    value,
    ["key", "label", "description", "fieldKeys"],
    path,
    issues,
  );
  uniqueKey(value.key, `${path}.key`, seen, issues);
  boundedString(value.label, `${path}.label`, 120, issues);
  optionalBoundedString(value.description, `${path}.description`, 500, issues);
  references(value.fieldKeys, `${path}.fieldKeys`, fields, 200, issues);
}

function validateAction(
  value: unknown,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
) {
  if (!record(value))
    return issues.push(issue(path, "type", "Action must be an object."));
  unknownKeys(value, ["key", "label", "kind"], path, issues);
  uniqueKey(value.key, `${path}.key`, seen, issues);
  boundedString(value.label, `${path}.label`, 120, issues);
  member(value.kind, ["save_draft", "submit"] as const, `${path}.kind`, issues);
}

function validateListConfig(
  value: unknown,
  path: string,
  schema: unknown,
  issues: ValidationIssue[],
) {
  if (!record(value))
    return issues.push(issue(path, "type", "List config must be an object."));
  unknownKeys(
    value,
    [
      "columns",
      "searchFields",
      "filterFields",
      "workspace",
      "pageSize",
      "defaultSort",
    ],
    path,
    issues,
  );
  const fields =
    record(schema) && Array.isArray(schema.fields)
      ? new Set(
          schema.fields
            .filter(record)
            .map((field) => field.key)
            .filter((entry): entry is string => typeof entry === "string"),
        )
      : new Set<string>();
  const allowedColumns = new Set([...fields, ...SYSTEM_COLUMNS]);
  if (
    !Array.isArray(value.columns) ||
    value.columns.length === 0 ||
    value.columns.length > 50
  ) {
    issues.push(
      issue(
        `${path}.columns`,
        "required",
        "List config must contain between 1 and 50 columns.",
      ),
    );
  } else {
    const columns = new Set<string>();
    value.columns.forEach((column, index) => {
      const columnPath = `${path}.columns[${index}]`;
      if (!record(column))
        return issues.push(
          issue(columnPath, "type", "Column must be an object."),
        );
      unknownKeys(column, ["fieldKey", "label"], columnPath, issues);
      referenceKey(
        column.fieldKey,
        `${columnPath}.fieldKey`,
        allowedColumns,
        columns,
        issues,
      );
      boundedString(column.label, `${columnPath}.label`, 120, issues);
    });
  }
  optionalReferences(
    value.searchFields,
    `${path}.searchFields`,
    fields,
    100,
    issues,
  );
  optionalReferences(
    value.filterFields,
    `${path}.filterFields`,
    fields,
    100,
    issues,
  );
  if (value.workspace !== undefined) {
    if (!record(value.workspace))
      issues.push(
        issue(`${path}.workspace`, "type", "Workspace must be an object."),
      );
    else {
      unknownKeys(
        value.workspace,
        ["showOnLanding", "defaultOnLanding"],
        `${path}.workspace`,
        issues,
      );
      optionalBooleanFields(
        value.workspace,
        ["showOnLanding", "defaultOnLanding"],
        `${path}.workspace`,
        issues,
        true,
      );
      if (
        value.workspace.defaultOnLanding === true &&
        value.workspace.showOnLanding !== true
      ) {
        issues.push(
          issue(
            `${path}.workspace.defaultOnLanding`,
            "invalid",
            "A default landing form must be shown on the landing page.",
          ),
        );
      }
    }
  }
  if (
    value.pageSize !== undefined &&
    (!Number.isInteger(value.pageSize) ||
      Number(value.pageSize) < 1 ||
      Number(value.pageSize) > 100)
  ) {
    issues.push(
      issue(
        `${path}.pageSize`,
        "invalid",
        "Page size must be a whole number from 1 to 100.",
      ),
    );
  }
  if (value.defaultSort !== "updated_at_desc")
    issues.push(
      issue(
        `${path}.defaultSort`,
        "unsupported",
        "defaultSort must be updated_at_desc.",
      ),
    );
}

function references(
  value: unknown,
  path: string,
  allowed: Set<string>,
  max: number,
  issues: ValidationIssue[],
) {
  if (!Array.isArray(value) || value.length === 0 || value.length > max)
    return issues.push(
      issue(path, "required", `Declare between 1 and ${max} field references.`),
    );
  const seen = new Set<string>();
  value.forEach((entry, index) =>
    referenceKey(entry, `${path}[${index}]`, allowed, seen, issues),
  );
}
function optionalReferences(
  value: unknown,
  path: string,
  allowed: Set<string>,
  max: number,
  issues: ValidationIssue[],
) {
  if (value !== undefined) references(value, path, allowed, max, issues);
}
function referenceKey(
  value: unknown,
  path: string,
  allowed: Set<string>,
  seen: Set<string>,
  issues: ValidationIssue[],
) {
  if (typeof value !== "string" || !allowed.has(value))
    issues.push(
      issue(path, "invalid", "Reference must name a declared field."),
    );
  else if (seen.has(value))
    issues.push(issue(path, "duplicate", `Duplicate reference ${value}.`));
  else seen.add(value);
}
function uniqueKey(
  value: unknown,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
) {
  if (typeof value !== "string" || !KEY.test(value))
    issues.push(issue(path, "invalid", "Use lowercase snake_case."));
  else if (seen.has(value))
    issues.push(issue(path, "duplicate", `Duplicate key ${value}.`));
  else seen.add(value);
}
function key(value: unknown, path: string, issues: ValidationIssue[]) {
  if (typeof value !== "string" || !KEY.test(value))
    issues.push(issue(path, "invalid", "Use lowercase snake_case."));
}
function boundedString(
  value: unknown,
  path: string,
  max: number,
  issues: ValidationIssue[],
) {
  if (typeof value !== "string" || value.trim() === "")
    issues.push(issue(path, "invalid", "Value must be a non-empty string."));
  else if (value.length > max)
    issues.push(
      issue(path, "too-long", `Value must be at most ${max} characters.`),
    );
}
function optionalBoundedString(
  value: unknown,
  path: string,
  max: number,
  issues: ValidationIssue[],
) {
  if (value !== undefined) boundedString(value, path, max, issues);
}
function optionalBooleanFields(
  value: Record<string, unknown>,
  fields: string[],
  path: string,
  issues: ValidationIssue[],
  required = false,
) {
  for (const field of fields) {
    if (required && value[field] === undefined)
      issues.push(
        issue(`${path}.${field}`, "required", `${field} is required.`),
      );
    else if (value[field] !== undefined && typeof value[field] !== "boolean")
      issues.push(
        issue(`${path}.${field}`, "type", `${field} must be boolean.`),
      );
  }
}
function member(
  value: unknown,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
) {
  if (typeof value !== "string" || !allowed.includes(value))
    issues.push(
      issue(path, "invalid", `Value must be one of: ${allowed.join(", ")}.`),
    );
}
function unknownKeys(
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
  issues: ValidationIssue[],
) {
  const accepted = new Set(allowed);
  for (const key of Object.keys(value))
    if (!accepted.has(key))
      issues.push(
        issue(
          `${path}.${key}`,
          "unknown-property",
          `Unknown property: ${key}.`,
        ),
      );
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

import type { ValidationIssue } from "../contracts/errors.js";
import type {
  DataInsightDashboardTemplateCatalog,
  FormsAnalyticsCatalog,
} from "../contracts/data-insight.js";
import type { ValidationResult } from "./manifest.js";

const KEY = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const DATASET_ID = /^[a-z][a-z0-9_.-]{0,159}$/;
const WIDGET_TYPES = new Set([
  "metric",
  "table",
  "text",
  "bar",
  "line",
  "area",
  "pie",
  "donut",
  "scatter",
]);
const VALUE_TYPES = new Set(["text", "number", "boolean", "timestamp"]);
const AGGREGATIONS = new Set([
  "count",
  "sum",
  "average",
  "sum_divide",
  "ratio_percent",
]);

export function validateFormsAnalyticsCatalog(
  input: unknown,
): ValidationResult<FormsAnalyticsCatalog> {
  const issues: ValidationIssue[] = [];
  if (!record(input)) return failed("$", "Catalog must be an object.");
  unknownKeys(
    input,
    ["schema_version", "metric_contract_version", "datasets"],
    "$",
    issues,
  );
  if (input.schema_version !== 1)
    issues.push(
      issue(
        "$.schema_version",
        "unsupported",
        "Supported analytics catalog schema is 1.",
      ),
    );
  boundedString(
    input.metric_contract_version,
    "$.metric_contract_version",
    40,
    issues,
  );
  if (!Array.isArray(input.datasets) || input.datasets.length > 100) {
    issues.push(
      issue(
        "$.datasets",
        "invalid",
        "datasets must contain at most 100 entries.",
      ),
    );
  } else {
    const ids = new Set<string>();
    input.datasets.forEach((value, index) =>
      validateDataset(value, index, ids, issues),
    );
  }
  return result(input, issues);
}

export function validateDataInsightDashboardTemplateCatalog(
  input: unknown,
): ValidationResult<DataInsightDashboardTemplateCatalog> {
  const issues: ValidationIssue[] = [];
  if (!record(input)) return failed("$", "Template catalog must be an object.");
  unknownKeys(input, ["schema_version", "templates"], "$", issues);
  if (input.schema_version !== 1)
    issues.push(
      issue(
        "$.schema_version",
        "unsupported",
        "Supported template catalog schema is 1.",
      ),
    );
  if (!Array.isArray(input.templates) || input.templates.length > 20) {
    issues.push(
      issue(
        "$.templates",
        "invalid",
        "templates must contain at most 20 entries.",
      ),
    );
  } else {
    const ids = new Set<string>();
    input.templates.forEach((value, index) =>
      validateTemplate(value, index, ids, issues),
    );
  }
  return result(input, issues);
}

function validateDataset(
  value: unknown,
  index: number,
  ids: Set<string>,
  issues: ValidationIssue[],
) {
  const path = `$.datasets[${index}]`;
  if (!record(value))
    return issues.push(issue(path, "type", "Dataset must be an object."));
  unknownKeys(
    value,
    [
      "dataset_id",
      "label",
      "module_key",
      "record_type",
      "parent_record_type",
      "dimensions",
      "measures",
      "default_time_field",
    ],
    path,
    issues,
  );
  unique(value.dataset_id, `${path}.dataset_id`, DATASET_ID, ids, issues);
  boundedString(value.label, `${path}.label`, 160, issues);
  key(value.module_key, `${path}.module_key`, issues);
  key(value.record_type, `${path}.record_type`, issues);
  if (value.parent_record_type !== undefined)
    key(value.parent_record_type, `${path}.parent_record_type`, issues);
  if (!Array.isArray(value.dimensions) || value.dimensions.length > 80)
    issues.push(
      issue(
        `${path}.dimensions`,
        "invalid",
        "dimensions must contain at most 80 entries.",
      ),
    );
  else {
    const fields = new Set<string>();
    value.dimensions.forEach((dimension, dimensionIndex) => {
      const dimensionPath = `${path}.dimensions[${dimensionIndex}]`;
      if (!record(dimension))
        return issues.push(
          issue(dimensionPath, "type", "Dimension must be an object."),
        );
      unknownKeys(
        dimension,
        ["field_key", "value_type", "sensitivity"],
        dimensionPath,
        issues,
      );
      unique(
        dimension.field_key,
        `${dimensionPath}.field_key`,
        KEY,
        fields,
        issues,
      );
      member(
        dimension.value_type,
        VALUE_TYPES,
        `${dimensionPath}.value_type`,
        issues,
      );
      boundedString(
        dimension.sensitivity,
        `${dimensionPath}.sensitivity`,
        40,
        issues,
      );
    });
  }
  if (
    !Array.isArray(value.measures) ||
    value.measures.length === 0 ||
    value.measures.length > 80
  )
    issues.push(
      issue(
        `${path}.measures`,
        "invalid",
        "measures must contain between 1 and 80 entries.",
      ),
    );
  else {
    const measures = new Set<string>();
    value.measures.forEach((measure, measureIndex) =>
      validateMeasure(
        measure,
        `${path}.measures[${measureIndex}]`,
        measures,
        issues,
      ),
    );
  }
  if (
    value.default_time_field !== null &&
    value.default_time_field !== undefined
  )
    key(value.default_time_field, `${path}.default_time_field`, issues);
}

function validateMeasure(
  value: unknown,
  path: string,
  keys: Set<string>,
  issues: ValidationIssue[],
) {
  if (!record(value))
    return issues.push(issue(path, "type", "Measure must be an object."));
  unknownKeys(
    value,
    [
      "key",
      "aggregation",
      "unit",
      "field_key",
      "numerator_field_key",
      "denominator_field_key",
      "divisor",
      "denominator_divisor",
      "zero_denominator",
    ],
    path,
    issues,
  );
  unique(value.key, `${path}.key`, KEY, keys, issues);
  member(value.aggregation, AGGREGATIONS, `${path}.aggregation`, issues);
  boundedString(value.unit, `${path}.unit`, 40, issues);
  for (const field of [
    "field_key",
    "numerator_field_key",
    "denominator_field_key",
  ] as const)
    if (value[field] !== undefined)
      key(value[field], `${path}.${field}`, issues);
  for (const field of ["divisor", "denominator_divisor"] as const)
    if (
      value[field] !== undefined &&
      (typeof value[field] !== "number" ||
        !Number.isFinite(value[field]) ||
        value[field] <= 0)
    )
      issues.push(
        issue(`${path}.${field}`, "invalid", `${field} must be positive.`),
      );
  if (
    ["sum", "average", "sum_divide"].includes(String(value.aggregation)) &&
    value.field_key === undefined
  )
    issues.push(
      issue(
        `${path}.field_key`,
        "required",
        "This aggregation requires field_key.",
      ),
    );
  if (
    value.aggregation === "ratio_percent" &&
    (value.numerator_field_key === undefined ||
      value.denominator_field_key === undefined ||
      value.zero_denominator !== "null")
  )
    issues.push(
      issue(
        path,
        "invalid",
        "ratio_percent requires numerator, denominator, and zero_denominator null.",
      ),
    );
}

function validateTemplate(
  value: unknown,
  index: number,
  ids: Set<string>,
  issues: ValidationIssue[],
) {
  const path = `$.templates[${index}]`;
  if (!record(value))
    return issues.push(issue(path, "type", "Template must be an object."));
  unknownKeys(
    value,
    [
      "id",
      "title",
      "description",
      "suggested_questions",
      "layout",
      "queries",
      "widgets",
    ],
    path,
    issues,
  );
  unique(value.id, `${path}.id`, KEY, ids, issues);
  boundedString(value.title, `${path}.title`, 160, issues);
  if (value.description !== undefined)
    boundedString(value.description, `${path}.description`, 1000, issues);
  if (!Array.isArray(value.queries) || value.queries.length > 20)
    issues.push(
      issue(
        `${path}.queries`,
        "invalid",
        "queries must contain at most 20 entries.",
      ),
    );
  const queryKeys = new Set<string>();
  if (Array.isArray(value.queries))
    value.queries.forEach((query, queryIndex) => {
      const queryPath = `${path}.queries[${queryIndex}]`;
      if (!record(query))
        return issues.push(
          issue(queryPath, "type", "Query must be an object."),
        );
      unknownKeys(
        query,
        [
          "key",
          "dataset_id",
          "name",
          "description",
          "semantic_query",
          "visualization_hint",
        ],
        queryPath,
        issues,
      );
      unique(query.key, `${queryPath}.key`, KEY, queryKeys, issues);
      if (
        typeof query.dataset_id !== "string" ||
        !DATASET_ID.test(query.dataset_id)
      )
        issues.push(
          issue(`${queryPath}.dataset_id`, "invalid", "dataset_id is invalid."),
        );
      boundedString(query.name, `${queryPath}.name`, 160, issues);
      if (!record(query.semantic_query))
        issues.push(
          issue(
            `${queryPath}.semantic_query`,
            "type",
            "semantic_query must be an object.",
          ),
        );
    });
  if (
    !Array.isArray(value.widgets) ||
    value.widgets.length === 0 ||
    value.widgets.length > 40
  )
    issues.push(
      issue(
        `${path}.widgets`,
        "invalid",
        "widgets must contain between 1 and 40 entries.",
      ),
    );
  const widgetKeys = new Set<string>();
  if (Array.isArray(value.widgets))
    value.widgets.forEach((widget, widgetIndex) => {
      const widgetPath = `${path}.widgets[${widgetIndex}]`;
      if (!record(widget))
        return issues.push(
          issue(widgetPath, "type", "Widget must be an object."),
        );
      unknownKeys(
        widget,
        [
          "key",
          "type",
          "title",
          "description",
          "query_key",
          "text_content",
          "config",
          "position",
        ],
        widgetPath,
        issues,
      );
      unique(widget.key, `${widgetPath}.key`, KEY, widgetKeys, issues);
      member(widget.type, WIDGET_TYPES, `${widgetPath}.type`, issues);
      boundedString(widget.title, `${widgetPath}.title`, 160, issues);
      if (
        widget.type === "text"
          ? typeof widget.text_content !== "string" ||
            widget.text_content.trim() === ""
          : typeof widget.query_key !== "string" ||
            !queryKeys.has(widget.query_key)
      )
        issues.push(
          issue(
            widgetPath,
            "invalid-source",
            "Widget source must reference a query, or text content for text widgets.",
          ),
        );
    });
}

function result<T>(
  input: unknown,
  issues: ValidationIssue[],
): ValidationResult<T> {
  return issues.length === 0
    ? { ok: true, value: input as T, issues }
    : { ok: false, issues };
}
function failed(path: string, message: string): ValidationResult<never> {
  return { ok: false, issues: [issue(path, "type", message)] };
}
function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function boundedString(
  value: unknown,
  path: string,
  max: number,
  issues: ValidationIssue[],
) {
  if (typeof value !== "string" || value.trim() === "" || value.length > max)
    issues.push(
      issue(
        path,
        "invalid",
        `Value must be a non-empty string of at most ${max} characters.`,
      ),
    );
}
function key(value: unknown, path: string, issues: ValidationIssue[]) {
  if (typeof value !== "string" || !KEY.test(value))
    issues.push(issue(path, "invalid", "Use a safe lowercase key."));
}
function unique(
  value: unknown,
  path: string,
  pattern: RegExp,
  seen: Set<string>,
  issues: ValidationIssue[],
) {
  if (typeof value !== "string" || !pattern.test(value))
    issues.push(issue(path, "invalid", "Identifier is invalid."));
  else if (seen.has(value))
    issues.push(issue(path, "duplicate", `Duplicate identifier ${value}.`));
  else seen.add(value);
}
function member(
  value: unknown,
  allowed: Set<string>,
  path: string,
  issues: ValidationIssue[],
) {
  if (typeof value !== "string" || !allowed.has(value))
    issues.push(
      issue(
        path,
        "invalid",
        `Value must be one of: ${[...allowed].join(", ")}.`,
      ),
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

import type { ValidationIssue } from "../contracts/errors.js";
import type {
  PluginStructuredEnrichmentInputV1,
  PluginStructuredEnrichmentResultV1,
} from "../contracts/structured-enrichment.js";
import {
  contractIssues,
  CONTRACT_KEY,
  CONTRACT_IDENTIFIER,
  CONTRACT_UTC,
  type ContractShape,
} from "./bounded-contract.js";
const text = (maxLength: number, minLength = 0) => ({
  type: "string",
  maxLength,
  minLength,
});
const object = (
  properties: Record<string, ContractShape>,
  required = Object.keys(properties),
) =>
  ({
    type: "object",
    additionalProperties: false,
    properties,
    required,
  }) as const;
const key = { type: "string", pattern: CONTRACT_KEY.source } as const;
const forbidden = [
  "tenant_id",
  "owner_user_id",
  "source_system_id",
  "event_id",
  "binding_revision",
  "revision",
  "resource_id",
  "source_title",
  "display_title",
  "title_provenance",
  "source_status",
  "investigation_status",
  "writeback_status",
  "correlation",
  "owner_id",
  "id",
  "incident_id",
  "source_event_id",
  "inbound_id",
  "upstream_incident_id",
  "thread_id",
  "turn_id",
  "grants",
  "permissions",
  "__proto__",
  "constructor",
  "prototype",
];
const field = {
  oneOf: [
    object({
      type: { enum: ["text", "number", "boolean", "date"] },
      label: text(160, 1),
    }),
    object({
      type: { const: "enum" },
      label: text(160, 1),
      enumValues: {
        type: "array",
        items: text(160, 1),
        minItems: 1,
        maxItems: 64,
        uniqueItems: true,
      },
    }),
  ],
};
const fields = {
  type: "object",
  propertyNames: { ...key, not: { enum: forbidden } },
  maxProperties: 64,
  additionalProperties: field,
};
const values = {
  type: "object",
  maxProperties: 64,
  propertyNames: key,
  additionalProperties: {
    oneOf: [
      text(2000),
      { type: "number" },
      { type: "boolean" },
      { type: "null" },
    ],
  },
} as const;
const input = {
  schemaVersion: { const: "1" },
  resource: object({
    kind: key,
    id: { type: "string", pattern: CONTRACT_IDENTIFIER.source },
  }),
  title: text(2000),
  description: text(32768),
  timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
};
export const STRUCTURED_ENRICHMENT_INPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opsrabbit.com/schemas/structured-enrichment-input.v1.json",
  oneOf: [
    object({ ...input, generateTitle: { const: true }, fields }),
    object({
      ...input,
      generateTitle: { const: false },
      fields: { ...fields, minProperties: 1 },
    }),
  ],
};
export const STRUCTURED_ENRICHMENT_RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opsrabbit.com/schemas/structured-enrichment-result.v1.json",
  oneOf: [
    object({ status: { const: "completed" }, title: text(200, 1), values }, [
      "status",
      "values",
    ]),
    object({
      status: { const: "unavailable" },
      reason: {
        enum: ["not_configured", "policy_blocked", "capacity_unavailable"],
      },
    }),
    object({ status: { const: "timeout" } }),
  ],
};
function issue(path: string, message: string): ValidationIssue {
  return { path, code: "invalid", message };
}
export function validateStructuredEnrichmentInput(
  value: unknown,
): ValidationIssue[] {
  return contractIssues(value, STRUCTURED_ENRICHMENT_INPUT_SCHEMA);
}
export function validateStructuredEnrichmentResult(
  value: unknown,
  input: PluginStructuredEnrichmentInputV1,
): ValidationIssue[] {
  const issues = contractIssues(value, STRUCTURED_ENRICHMENT_RESULT_SCHEMA);
  const inputIssues = validateStructuredEnrichmentInput(input);
  if (issues.length || inputIssues.length) return [...issues, ...inputIssues];
  const result = value as PluginStructuredEnrichmentResultV1;
  if (result.status !== "completed") return issues;
  if (!input.generateTitle && result.title !== undefined)
    issues.push(issue("$.title", "Title generation was not requested."));
  for (const [name, fieldValue] of Object.entries(result.values)) {
    const field = Object.hasOwn(input.fields, name)
      ? input.fields[name]
      : undefined;
    if (!field) {
      issues.push(issue(`$.values.${name}`, "Output field was not requested."));
      continue;
    }
    if (fieldValue === null) continue;
    const valid =
      field.type === "number"
        ? typeof fieldValue === "number"
        : field.type === "boolean"
          ? typeof fieldValue === "boolean"
          : typeof fieldValue === "string" &&
            (field.type === "date"
              ? CONTRACT_UTC.test(fieldValue)
              : field.type === "enum"
                ? field.enumValues.includes(fieldValue)
                : true);
    if (!valid)
      issues.push(
        issue(
          `$.values.${name}`,
          "Output does not match its declared field type.",
        ),
      );
  }
  return issues;
}

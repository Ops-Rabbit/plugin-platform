import {
  contractIssues,
  CONTRACT_KEY,
  CONTRACT_IDENTIFIER,
  CONTRACT_COLUMN,
  CONTRACT_MESSAGE_KEY,
  CONTRACT_UTC,
  type ContractShape,
} from "./bounded-contract.js";
import type { ValidationIssue } from "../contracts/errors.js";

const key = { type: "string", pattern: CONTRACT_KEY.source } as const;
const id = { type: "string", pattern: CONTRACT_IDENTIFIER.source } as const;
const column = { type: "string", pattern: CONTRACT_COLUMN.source } as const;
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
const list = (
  items: ContractShape,
  maxItems: number,
  minItems = 0,
  uniqueItems = false,
) => ({ type: "array", items, maxItems, minItems, uniqueItems });
const parameter = {
  oneOf: [
    text(32768),
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
};
const timestamp = { type: "string", pattern: CONTRACT_UTC.source } as const;
const schema = (name: string, body: ContractShape) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: `https://opsrabbit.com/schemas/${name}.v1.json`,
  ...body,
});

export const PLUGIN_RESOURCE_QUERY_SCHEMA = schema(
  "plugin-resource-query",
  object(
    {
      schemaVersion: { const: "1" },
      kind: key,
      tenantIds: { oneOf: [{ const: "all" }, list(id, 100, 1, true)] },
      candidates: object({
        sql: text(32768, 1),
        parameters: list(parameter, 128),
      }),
      orderBy: list(
        object({ column, direction: { enum: ["asc", "desc"] } }),
        4,
        1,
      ),
      page: { type: "integer", minimum: 1, maximum: 10000 },
      pageSize: { type: "integer", minimum: 1, maximum: 100 },
      groupBy: column,
    },
    [
      "schemaVersion",
      "kind",
      "tenantIds",
      "candidates",
      "orderBy",
      "page",
      "pageSize",
    ],
  ),
);
export const PLUGIN_RESOURCE_REGISTRATION_SCHEMA = schema(
  "plugin-resource-registration",
  object({ kind: key, id, eligibleAt: timestamp }),
);
export const PLUGIN_RESOURCE_DELETION_SCHEMA = schema(
  "plugin-resource-deletion",
  object({
    schemaVersion: { const: "1" },
    kind: key,
    ids: list(id, 100, 1, true),
    reason: {
      enum: ["retention", "manual", "tenant_deleted", "restore_reconciliation"],
    },
  }),
);
export const PLUGIN_RESOURCE_CAPABILITY_SCHEMA = schema(
  "plugin-resource-capability",
  object({
    schemaVersion: { const: "1" },
    kinds: {
      type: "object",
      minProperties: 1,
      maxProperties: 16,
      propertyNames: key,
      additionalProperties: object({
        labelKey: { type: "string", pattern: CONTRACT_MESSAGE_KEY.source },
        descriptionKey: {
          type: "string",
          pattern: CONTRACT_MESSAGE_KEY.source,
        },
        retention: object({
          defaultMode: { const: "retain_indefinitely" },
          supportedModes: list(
            {
              enum: [
                "do_not_persist",
                "retain_for_days",
                "retain_indefinitely",
              ],
            },
            3,
            3,
            true,
          ),
        }),
      }),
    },
  }),
);
export function validatePluginResourceQuery(value: unknown): ValidationIssue[] {
  return contractIssues(value, PLUGIN_RESOURCE_QUERY_SCHEMA);
}
export function validatePluginResourceRegistration(
  value: unknown,
): ValidationIssue[] {
  return contractIssues(value, PLUGIN_RESOURCE_REGISTRATION_SCHEMA);
}
export function validatePluginResourceDeletion(
  value: unknown,
): ValidationIssue[] {
  return contractIssues(value, PLUGIN_RESOURCE_DELETION_SCHEMA);
}
export function validatePluginResourceCapability(
  value: unknown,
): ValidationIssue[] {
  return contractIssues(value, PLUGIN_RESOURCE_CAPABILITY_SCHEMA);
}

export const PLUGIN_SOURCE_INBOUND_BINDING_SCHEMA = schema(
  "plugin-source-inbound-binding",
  object({ inboundId: id, kind: key, enabled: { type: "boolean" } }),
);
export function validatePluginSourceInboundBinding(
  value: unknown,
): ValidationIssue[] {
  return contractIssues(value, PLUGIN_SOURCE_INBOUND_BINDING_SCHEMA);
}

export const PLUGIN_RESOURCE_TRANSACTION_SCHEMA = schema(
  "plugin-resource-transaction",
  {
    oneOf: [
      object({
        kind: key,
        purpose: { const: "records" },
        operation: { enum: ["create", "write"] },
        ids: list(id, 100, 1, true),
      }),
      object({ kind: key, purpose: { const: "configuration" } }),
    ],
  },
);
export function validatePluginResourceTransaction(
  value: unknown,
): ValidationIssue[] {
  return contractIssues(value, PLUGIN_RESOURCE_TRANSACTION_SCHEMA);
}

import type { PluginDeclaredCapabilities } from "../contracts/capabilities.js";
import type { PluginInboundRegistrationCapabilityV1 } from "../contracts/inbound-registration.js";
import type { ValidationIssue } from "../contracts/errors.js";
import {
  contractIssues,
  CONTRACT_IDENTIFIER,
  CONTRACT_KEY,
  CONTRACT_MESSAGE_KEY,
  type ContractShape,
} from "./bounded-contract.js";

const key = { type: "string", pattern: CONTRACT_KEY.source } as const;
const id = { type: "string", pattern: CONTRACT_IDENTIFIER.source } as const;
const message = {
  type: "string",
  pattern: CONTRACT_MESSAGE_KEY.source,
} as const;
const object = (
  properties: Record<string, ContractShape>,
  required = Object.keys(properties),
): ContractShape => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
function json(depth: number): ContractShape {
  const scalar: ContractShape[] = [
    { type: "string", maxLength: 32768 },
    { type: "boolean" },
    { type: "number" },
    { type: "null" },
  ];
  return {
    oneOf: depth
      ? [
          ...scalar,
          { type: "array", items: json(depth - 1), maxItems: 64 },
          {
            type: "object",
            propertyNames: { type: "string", minLength: 1, maxLength: 120 },
            additionalProperties: json(depth - 1),
            maxProperties: 64,
          },
        ]
      : scalar,
  };
}
export const PLUGIN_INBOUND_REGISTRATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opsrabbit.com/schemas/plugin-inbound-registration.v1.json",
  ...object(
    {
      schemaVersion: { const: "1" },
      resourceKind: key,
      sourceProviders: {
        type: "array",
        items: key,
        minItems: 1,
        maxItems: 64,
        uniqueItems: true,
      },
      labelKey: message,
      descriptionKey: message,
      configuration: object({
        readActionId: id,
        writeActionId: id,
        fields: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: {
            oneOf: ["boolean", "text", "json"].map((type) =>
              object(
                {
                  key: {
                    ...key,
                    not: {
                      enum: [
                        "enabled",
                        "grants",
                        "tenant_id",
                        "owner_id",
                        "retention_policy",
                      ],
                    },
                  },
                  labelKey: message,
                  descriptionKey: message,
                  type: { const: type },
                  default:
                    type === "boolean"
                      ? { type: "boolean" }
                      : type === "text"
                        ? { type: "string", maxLength: 32768 }
                        : json(5),
                },
                ["key", "labelKey", "type", "default"],
              ),
            ),
          },
        },
      }),
    },
    [
      "schemaVersion",
      "resourceKind",
      "sourceProviders",
      "labelKey",
      "descriptionKey",
    ],
  ),
};
export const PLUGIN_INBOUND_CONFIGURATION_REQUEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opsrabbit.com/schemas/plugin-inbound-configuration-request.v1.json",
  ...object({ inboundId: id }),
};
export const PLUGIN_INBOUND_CONFIGURATION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opsrabbit.com/schemas/plugin-inbound-configuration.v1.json",
  ...object({
    inboundId: id,
    incarnationId: id,
    revision: { type: "integer", minimum: 0, maximum: 2147483647 },
    values: {
      type: "object",
      propertyNames: key,
      additionalProperties: json(5),
      maxProperties: 16,
    },
  }),
};
const issue = (path: string, message: string): ValidationIssue => ({
  path,
  code: "invalid",
  message,
});
export function validatePluginInboundRegistration(
  value: unknown,
  capabilities?: PluginDeclaredCapabilities,
): ValidationIssue[] {
  const issues = contractIssues(value, PLUGIN_INBOUND_REGISTRATION_SCHEMA);
  if (issues.length) return issues;
  const input = value as PluginInboundRegistrationCapabilityV1;
  const fields = input.configuration?.fields ?? [];
  if (new Set(fields.map((field) => field.key)).size !== fields.length)
    issues.push(
      issue("$.configuration.fields", "Configuration keys must be unique."),
    );
  if (capabilities) {
    if (
      !capabilities.resourceRecords?.kinds ||
      !Object.hasOwn(capabilities.resourceRecords.kinds, input.resourceKind) ||
      capabilities.inboundLifecycle?.schemaVersion !== "1" ||
      capabilities.localization?.schemaVersion !== "1"
    )
      issues.push(
        issue(
          "$",
          "Inbound registration requires declared resource, lifecycle and localization capabilities.",
        ),
      );
    if (input.configuration) {
      const actions = Array.isArray(capabilities.actions)
        ? capabilities.actions
        : [];
      const read = actions.find(
        (action) => action && action.id === input.configuration!.readActionId,
      );
      const write = actions.find(
        (action) => action && action.id === input.configuration!.writeActionId,
      );
      if (
        !read ||
        read.risk !== "read" ||
        read.requiredRole !== "admin" ||
        read.deploymentAdminOnly ||
        !write ||
        write.risk !== "write" ||
        write.requiredRole !== "admin" ||
        write.deploymentAdminOnly
      )
        issues.push(
          issue(
            "$.configuration",
            "Configuration actions must be declared tenant-admin read/write actions.",
          ),
        );
    }
  }
  return issues;
}
export function validatePluginInboundConfigurationRequest(
  value: unknown,
): ValidationIssue[] {
  return contractIssues(value, PLUGIN_INBOUND_CONFIGURATION_REQUEST_SCHEMA);
}
export function validatePluginInboundConfiguration(
  value: unknown,
  capability?: PluginInboundRegistrationCapabilityV1,
): ValidationIssue[] {
  const issues = contractIssues(value, PLUGIN_INBOUND_CONFIGURATION_SCHEMA);
  if (issues.length || !capability) return issues;
  const fields = capability.configuration?.fields ?? [];
  const input = value as { values: Record<string, unknown> };
  if (
    Object.keys(input.values).some(
      (name) => !fields.some((field) => field.key === name),
    ) ||
    fields.some((field) => !Object.hasOwn(input.values, field.key))
  )
    issues.push(
      issue(
        "$.values",
        "Configuration must contain exactly the declared fields.",
      ),
    );
  for (const field of fields)
    if (Object.hasOwn(input.values, field.key)) {
      const current = input.values[field.key];
      if (
        (field.type === "boolean" && typeof current !== "boolean") ||
        (field.type === "text" && typeof current !== "string")
      )
        issues.push(
          issue(
            `$.values.${field.key}`,
            "Configuration value has an invalid type.",
          ),
        );
    }
  return issues;
}

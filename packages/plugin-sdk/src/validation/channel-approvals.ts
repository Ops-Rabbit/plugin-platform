import type { ValidationIssue } from "../contracts/errors.js";
import type { ChannelApprovalDecisionV1 } from "../contracts/channel-approvals.js";

export const CHANNEL_APPROVAL_DECISION_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "deliveryId",
    "externalConversationKey",
    "messageId",
    "botUserId",
    "actor",
    "decision",
  ],
  properties: {
    schemaVersion: { const: "1" },
    deliveryId: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,160}$" },
    externalConversationKey: { type: "string", minLength: 1, maxLength: 256 },
    messageId: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,160}$" },
    botUserId: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,160}$" },
    actor: {
      type: "object",
      additionalProperties: false,
      required: ["provider", "workspaceId", "userId", "displayName"],
      properties: {
        provider: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,39}$" },
        workspaceId: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,160}$" },
        userId: { type: "string", pattern: "^[A-Za-z0-9._:-]{1,160}$" },
        displayName: { type: "string", minLength: 1, maxLength: 160 },
      },
    },
    decision: { enum: ["allow-once", "deny"] },
  },
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateChannelApprovalDecision(
  value: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!record(value))
    return [
      { path: "$", code: "type", message: "Decision must be an object." },
    ];
  const schema = CHANNEL_APPROVAL_DECISION_SCHEMA;
  function check(
    input: Record<string, unknown>,
    properties: Record<
      string,
      {
        type?: string;
        pattern?: string;
        minLength?: number;
        maxLength?: number;
        const?: string;
        enum?: readonly string[];
      }
    >,
    path: string,
  ) {
    for (const key of Object.keys(input)) {
      if (!Object.hasOwn(properties, key))
        issues.push({
          path: `${path}.${key}`,
          code: "unknown",
          message: "Unknown decision field.",
        });
    }
    for (const [key, field] of Object.entries(properties)) {
      if (key === "actor") continue;
      const entry = input[key];
      if (
        typeof entry !== "string" ||
        (field.pattern && !new RegExp(field.pattern, "u").test(entry)) ||
        (field.minLength !== undefined &&
          [...entry].length < field.minLength) ||
        (field.maxLength !== undefined &&
          [...entry].length > field.maxLength) ||
        (field.const !== undefined && entry !== field.const) ||
        (field.enum && !field.enum.includes(entry))
      ) {
        issues.push({
          path: `${path}.${key}`,
          code: "invalid",
          message: "Invalid decision field.",
        });
      }
    }
  }
  check(value, schema.properties, "$");
  if (!record(value.actor))
    issues.push({
      path: "$.actor",
      code: "type",
      message: "Verified external actor is required.",
    });
  else check(value.actor, schema.properties.actor.properties, "$.actor");
  return issues;
}

export function isChannelApprovalDecision(
  value: unknown,
): value is ChannelApprovalDecisionV1 {
  return validateChannelApprovalDecision(value).length === 0;
}

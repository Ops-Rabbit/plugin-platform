import type { ValidationIssue } from "../contracts/errors.js";
import type { ChannelApprovalCleanupV1 } from "../contracts/channel-approvals.js";

const identifier = {
  type: "string",
  pattern: "^[A-Za-z0-9._:-]{1,160}$",
} as const;
const nullableIdentifier = { anyOf: [identifier, { type: "null" }] } as const;

export const CHANNEL_APPROVAL_CLEANUP_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "cleanupId",
    "claimToken",
    "deliveryId",
    "externalConversationKey",
    "workspaceId",
    "botUserId",
    "messageId",
    "receiptMessageId",
    "uncertain",
  ],
  properties: {
    schemaVersion: { const: "1" },
    cleanupId: identifier,
    claimToken: identifier,
    deliveryId: identifier,
    externalConversationKey: { type: "string", minLength: 1, maxLength: 256 },
    workspaceId: identifier,
    botUserId: identifier,
    messageId: nullableIdentifier,
    receiptMessageId: nullableIdentifier,
    uncertain: { type: "boolean" },
  },
} as const;

export function validateChannelApprovalCleanup(
  input: unknown,
): ValidationIssue[] {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return [{ path: "$", code: "type", message: "Cleanup must be an object." }];
  }
  const value = input as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  const properties = CHANNEL_APPROVAL_CLEANUP_SCHEMA.properties;
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(properties, key))
      issues.push({
        path: `$.${key}`,
        code: "unknown",
        message: "Unknown cleanup field.",
      });
  }
  for (const key of Object.keys(properties)) {
    const entry = value[key];
    const nullable = key === "messageId" || key === "receiptMessageId";
    let valid;
    if (nullable && entry === null) valid = true;
    else if (key === "schemaVersion") valid = entry === "1";
    else if (key === "uncertain") valid = typeof entry === "boolean";
    else if (key === "externalConversationKey")
      valid =
        typeof entry === "string" &&
        [...entry].length >= 1 &&
        [...entry].length <= 256;
    else
      valid =
        typeof entry === "string" &&
        new RegExp(identifier.pattern, "u").test(entry);
    if (!valid)
      issues.push({
        path: `$.${key}`,
        code: "invalid",
        message: "Invalid cleanup field.",
      });
  }
  return issues;
}

export function isChannelApprovalCleanup(
  input: unknown,
): input is ChannelApprovalCleanupV1 {
  return validateChannelApprovalCleanup(input).length === 0;
}

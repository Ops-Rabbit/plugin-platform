import type { ChannelMessagingInputV1 } from "../contracts/channel-messaging.js";
import type { ValidationIssue } from "../contracts/errors.js";

export const CHANNEL_MESSAGING_INPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["instanceId", "channelId", "text"],
  properties: {
    instanceId: {
      type: "string",
      pattern: "^[A-Za-z0-9._:-]{1,160}(?![\\s\\S])",
    },
    channelId: {
      type: "string",
      pattern: "^[A-Za-z0-9._:-]{1,160}(?![\\s\\S])",
    },
    threadId: {
      type: "string",
      pattern: "^[A-Za-z0-9._:-]{1,160}(?![\\s\\S])",
    },
    text: { type: "string", minLength: 1, maxLength: 4000, pattern: "\\S" },
  },
} as const;

export function validateChannelMessagingInput(
  value: unknown,
): ValidationIssue[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ path: "$", code: "type", message: "Message must be an object." }];
  }
  const input = value as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(CHANNEL_MESSAGING_INPUT_SCHEMA.properties, key)) {
      issues.push({
        path: `$.${key}`,
        code: "unknown_field",
        message: "Unknown message field.",
      });
    }
  }
  for (const key of ["instanceId", "channelId", "threadId"] as const) {
    if (key === "threadId" && !Object.hasOwn(input, key)) continue;
    const item = input[key];
    if (
      typeof item !== "string" ||
      !new RegExp(
        CHANNEL_MESSAGING_INPUT_SCHEMA.properties[key].pattern,
        "u",
      ).test(item)
    ) {
      issues.push({
        path: `$.${key}`,
        code: "invalid_value",
        message: "Expected a stable destination identifier.",
      });
    }
  }
  if (
    typeof input.text !== "string" ||
    !input.text.trim() ||
    [...input.text].length > 4000
  ) {
    issues.push({
      path: "$.text",
      code: "invalid_value",
      message: "Message must contain 1 to 4000 characters.",
    });
  }
  return issues;
}

export function isChannelMessagingInput(
  value: unknown,
): value is ChannelMessagingInputV1 {
  return validateChannelMessagingInput(value).length === 0;
}

import {
  CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH,
  CHAT_TURN_RECORDS_MAX_TURN_IDS,
} from "../contracts/chat-turn-records.js";
import type { ValidationIssue } from "../contracts/errors.js";

// ECMA-262 patterns, the JSON Schema dialect: without the `m` flag `$` matches only at the end.
const IDENTIFIER_PATTERN = "^[A-Za-z0-9._:-]{1,160}$";
// RFC 3339 profile: UTC (`Z`) with optional 1-9 fractional second digits.
const TIMESTAMP_PATTERN =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,9})?Z$";
const IDENTIFIER = new RegExp(IDENTIFIER_PATTERN, "u");
const TIMESTAMP = new RegExp(TIMESTAMP_PATTERN, "u");
const RECORD_KEYS = [
  "turnId",
  "threadId",
  "userMessage",
  "userMessageTruncated",
  "feedback",
  "feedbackUpdatedAt",
] as const;

export const CHAT_TURN_RECORDS_REQUEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opsrabbit.dev/schemas/opsrabbit-chat-turn-records-request.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["turnIds"],
  properties: {
    turnIds: {
      type: "array",
      minItems: 1,
      maxItems: CHAT_TURN_RECORDS_MAX_TURN_IDS,
      uniqueItems: true,
      items: { type: "string", pattern: IDENTIFIER_PATTERN },
    },
  },
} as const;

export const CHAT_TURN_RECORDS_RESULT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://opsrabbit.dev/schemas/opsrabbit-chat-turn-records-result.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["turns"],
  properties: {
    turns: {
      type: "array",
      maxItems: CHAT_TURN_RECORDS_MAX_TURN_IDS,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...RECORD_KEYS],
        properties: {
          turnId: { type: "string", pattern: IDENTIFIER_PATTERN },
          threadId: { type: "string", pattern: IDENTIFIER_PATTERN },
          userMessage: {
            type: ["string", "null"],
            maxLength: CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH,
          },
          userMessageTruncated: { type: "boolean" },
          feedback: { enum: ["thumbs_up", "thumbs_down", null] },
          feedbackUpdatedAt: {
            type: ["string", "null"],
            pattern: TIMESTAMP_PATTERN,
          },
        },
        allOf: [
          {
            if: { properties: { feedback: { const: null } } },
            then: { properties: { feedbackUpdatedAt: { const: null } } },
            else: { properties: { feedbackUpdatedAt: { type: "string" } } },
          },
          {
            if: { properties: { userMessage: { const: null } } },
            then: { properties: { userMessageTruncated: { const: false } } },
          },
        ],
      },
    },
  },
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** RFC 3339 UTC timestamp that names a real instant (rejects e.g. February 31). */
function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const [date, time] = value.slice(0, 19).split("T") as [string, string];
  return parsed.toISOString().startsWith(`${date}T${time}`);
}

/** Validates a plugin's `chatTurnRecords.getTurns` request before the host reads any turn. */
export function validateChatTurnRecordsRequest(
  value: unknown,
): ValidationIssue[] {
  if (!record(value))
    return [{ path: "$", code: "type", message: "Request must be an object." }];
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(value))
    if (key !== "turnIds")
      issues.push({
        path: `$.${key}`,
        code: "unknown_field",
        message: "Unknown request field.",
      });
  const turnIds = value.turnIds;
  if (
    !Array.isArray(turnIds) ||
    turnIds.length < 1 ||
    turnIds.length > CHAT_TURN_RECORDS_MAX_TURN_IDS
  ) {
    issues.push({
      path: "$.turnIds",
      code: "invalid_value",
      message: `Request 1 to ${CHAT_TURN_RECORDS_MAX_TURN_IDS} turn ids.`,
    });
    return issues;
  }
  const seen = new Set<string>();
  turnIds.forEach((turnId, index) => {
    if (typeof turnId !== "string" || !IDENTIFIER.test(turnId))
      issues.push({
        path: `$.turnIds[${index}]`,
        code: "invalid_value",
        message: "Expected a stable turn identifier.",
      });
    else if (seen.has(turnId))
      issues.push({
        path: `$.turnIds[${index}]`,
        code: "duplicate",
        message: "Turn ids must be unique.",
      });
    else seen.add(turnId);
  });
  return issues;
}

/**
 * Validates a host result against the request it answers. Hosts self-check before returning a
 * result; returned turns must be requested ones, each at most once, in request order.
 */
export function validateChatTurnRecordsResult(
  value: unknown,
  request: { readonly turnIds: readonly string[] },
): ValidationIssue[] {
  if (!record(value) || !Array.isArray(value.turns))
    return [
      {
        path: "$.turns",
        code: "type",
        message: "Result must contain a turns array.",
      },
    ];
  if (validateChatTurnRecordsRequest(request).length > 0)
    return [
      {
        path: "$request",
        code: "invalid_value",
        message: "The request being answered is invalid.",
      },
    ];
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(value))
    if (key !== "turns")
      issues.push({
        path: `$.${key}`,
        code: "unknown_field",
        message: "Unknown result field.",
      });
  const position = new Map(
    request.turnIds.map((turnId, index) => [turnId, index]),
  );
  let lastPosition = -1;
  value.turns.forEach((turn, index) => {
    const path = `$.turns[${index}]`;
    if (!record(turn)) {
      issues.push({ path, code: "type", message: "Turn must be an object." });
      return;
    }
    for (const key of Object.keys(turn))
      if (!(RECORD_KEYS as readonly string[]).includes(key))
        issues.push({
          path: `${path}.${key}`,
          code: "unknown_field",
          message: "Unknown turn field.",
        });
    const requested =
      typeof turn.turnId === "string" ? position.get(turn.turnId) : undefined;
    if (requested === undefined)
      issues.push({
        path: `${path}.turnId`,
        code: "invalid_value",
        message: "Only requested turns may be returned.",
      });
    else if (requested <= lastPosition)
      issues.push({
        path: `${path}.turnId`,
        code: "order",
        message: "Turns must be returned once each, in request order.",
      });
    else lastPosition = requested;
    if (typeof turn.threadId !== "string" || !IDENTIFIER.test(turn.threadId))
      issues.push({
        path: `${path}.threadId`,
        code: "invalid_value",
        message: "Expected a stable thread identifier.",
      });
    if (
      turn.userMessage !== null &&
      (typeof turn.userMessage !== "string" ||
        [...turn.userMessage].length > CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH)
    )
      issues.push({
        path: `${path}.userMessage`,
        code: "invalid_value",
        message: `User message must be null or at most ${CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH} code points.`,
      });
    if (typeof turn.userMessageTruncated !== "boolean")
      issues.push({
        path: `${path}.userMessageTruncated`,
        code: "type",
        message: "userMessageTruncated must be a boolean.",
      });
    else if (turn.userMessage === null && turn.userMessageTruncated)
      issues.push({
        path: `${path}.userMessageTruncated`,
        code: "invalid_value",
        message: "A missing user message cannot be truncated.",
      });
    if (
      turn.feedback !== null &&
      turn.feedback !== "thumbs_up" &&
      turn.feedback !== "thumbs_down"
    )
      issues.push({
        path: `${path}.feedback`,
        code: "invalid_value",
        message: "Feedback must be thumbs_up, thumbs_down, or null.",
      });
    if (
      turn.feedbackUpdatedAt !== null &&
      !isUtcTimestamp(turn.feedbackUpdatedAt)
    )
      issues.push({
        path: `${path}.feedbackUpdatedAt`,
        code: "invalid_value",
        message: "feedbackUpdatedAt must be null or an RFC 3339 UTC timestamp.",
      });
    else if ((turn.feedback === null) !== (turn.feedbackUpdatedAt === null))
      issues.push({
        path: `${path}.feedbackUpdatedAt`,
        code: "invalid_value",
        message: "feedbackUpdatedAt must be set exactly when feedback is set.",
      });
  });
  return issues;
}

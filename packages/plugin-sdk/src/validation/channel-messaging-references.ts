import type { ValidationIssue } from "../contracts/errors.js";
import type { ChannelMessagingReferenceRequestV1 } from "../contracts/channel-messaging-references.js";

const ID_PATTERN = "^[A-Za-z0-9._:-]{1,160}(?![\\s\\S])";
const VALUE_PATTERN = "^[^\\u0000-\\u001f\\u007f]{1,1024}(?![\\s\\S])";
// Only a URL shape check. Hosts/adapters must additionally enforce their provider endpoint policy.
const URL_PATTERN =
  "^https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?(?:/[A-Za-z0-9/_-]*)?(?![\\s\\S])";
const ID = new RegExp(ID_PATTERN, "u");
const VALUE = new RegExp(VALUE_PATTERN, "u");
const URL_SHAPE = new RegExp(URL_PATTERN, "u");
const id = { type: "string", pattern: ID_PATTERN } as const;
const value = { type: "string", pattern: VALUE_PATTERN } as const;
const dialect = "https://json-schema.org/draft/2020-12/schema";
const requestDestination = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "channelId"],
  properties: { kind: { const: "destination" }, channelId: id },
} as const;
const requestMessage = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "channelId", "messageId"],
  properties: { kind: { const: "sent_message" }, channelId: id, messageId: id },
} as const;
export const CHANNEL_MESSAGING_REFERENCE_REQUEST_SCHEMA = {
  $schema: dialect,
  oneOf: [requestDestination, requestMessage],
} as const;
export const CHANNEL_MESSAGING_REFERENCE_RESULT_SCHEMA = {
  $schema: dialect,
  oneOf: [
    { type: "null" },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "channelId", "routing"],
      properties: {
        kind: { const: "destination" },
        channelId: id,
        routing: {
          type: "object",
          additionalProperties: false,
          required: [
            "provider",
            "serviceUrl",
            "conversationId",
            "providerTenantId",
            "teamId",
            "botId",
          ],
          properties: {
            provider: { const: "teams" },
            serviceUrl: {
              type: "string",
              maxLength: 2048,
              pattern: URL_PATTERN,
            },
            conversationId: value,
            providerTenantId: value,
            teamId: value,
            botId: value,
          },
        },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["kind", "channelId", "messageId", "text"],
      properties: {
        kind: { const: "sent_message" },
        channelId: id,
        messageId: id,
        text: { type: "string", minLength: 1, maxLength: 4000, pattern: "\\S" },
      },
    },
  ],
} as const;

type RecordValue = Record<string, unknown>;
/** Read own data properties without invoking getters or inherited values. */
function record(input: unknown): RecordValue | null {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const result: RecordValue = Object.create(null) as RecordValue;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!("value" in descriptor) || !descriptor.enumerable) return null;
    result[key] = descriptor.value;
  }
  return result;
}
function exact(input: RecordValue, keys: readonly string[]) {
  return (
    Object.keys(input).length === keys.length &&
    keys.every((key) => Object.hasOwn(input, key))
  );
}
function matches(input: unknown, pattern: RegExp) {
  return typeof input === "string" && pattern.test(input);
}
function validRequest(input: RecordValue | null): boolean {
  if (!input || !matches(input.channelId, ID)) return false;
  return input.kind === "destination"
    ? exact(input, ["kind", "channelId"])
    : input.kind === "sent_message" &&
        exact(input, ["kind", "channelId", "messageId"]) &&
        matches(input.messageId, ID);
}
const issue = (): ValidationIssue[] => [
  {
    path: "$",
    code: "invalid_value",
    message: "Invalid or mismatched channel messaging reference.",
  },
];
export function validateChannelMessagingReferenceRequest(
  input: unknown,
): ValidationIssue[] {
  return validRequest(record(input)) ? [] : issue();
}
/** Bind results to their request; structural validation alone is not authorization. */
export function validateChannelMessagingReferenceResult(
  input: unknown,
  request?: ChannelMessagingReferenceRequestV1,
): ValidationIssue[] {
  const bound = request === undefined ? undefined : record(request);
  if (bound !== undefined && !validRequest(bound)) return issue();
  if (input === null) return [];
  const data = record(input);
  if (!data || !matches(data.channelId, ID)) return issue();
  if (bound && (data.kind !== bound.kind || data.channelId !== bound.channelId))
    return issue();
  if (data.kind === "sent_message") {
    if (
      !exact(data, ["kind", "channelId", "messageId", "text"]) ||
      !matches(data.messageId, ID) ||
      typeof data.text !== "string" ||
      !data.text.trim() ||
      [...data.text].length > 4000 ||
      (bound && data.messageId !== bound.messageId)
    )
      return issue();
    return [];
  }
  if (
    data.kind !== "destination" ||
    !exact(data, ["kind", "channelId", "routing"])
  )
    return issue();
  const routing = record(data.routing);
  if (
    !routing ||
    !exact(routing, [
      "provider",
      "serviceUrl",
      "conversationId",
      "providerTenantId",
      "teamId",
      "botId",
    ]) ||
    routing.provider !== "teams" ||
    !matches(routing.serviceUrl, URL_SHAPE) ||
    (routing.serviceUrl as string).length > 2048 ||
    !["conversationId", "providerTenantId", "teamId", "botId"].every((key) =>
      matches(routing[key], VALUE),
    )
  )
    return issue();
  return [];
}

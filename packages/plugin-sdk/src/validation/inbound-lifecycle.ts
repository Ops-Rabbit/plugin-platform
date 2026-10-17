import type { ValidationIssue } from "../contracts/errors.js";
import type { InboundLifecycleEventV1 } from "../contracts/inbound-lifecycle.js";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]+(?![\s\S])/u;
// Calendar-valid Gregorian UTC timestamps, including century leap-year rules.
// Fixed bounds avoid relying on optional JSON Schema format assertions.
const UTC_PATTERN =
  /^(?:[0-9]{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|02-(?:0[1-9]|1[0-9]|2[0-8]))|(?:[0-9]{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29)T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z(?![\s\S])/u;

const identifier = {
  type: "string",
  minLength: 1,
  maxLength: 160,
  pattern: IDENTIFIER_PATTERN.source,
} as const;
const text = (maximum: number) => ({ type: "string", maxLength: maximum });
const object = (
  properties: Record<string, Shape>,
  required: readonly string[],
) => ({ type: "object", additionalProperties: false, properties, required });
const variants = [
  object(
    {
      type: { const: "received" },
      title: text(2000),
      description: text(32768),
      upstreamIncidentId: { ...text(500), minLength: 1 },
      severity: text(80),
    },
    ["type", "title"],
  ),
  {
    oneOf: [
      object(
        {
          type: { const: "correlated" },
          disposition: { const: "joined" },
          threadId: identifier,
          reason: text(2000),
        },
        ["type", "disposition", "threadId"],
      ),
      object(
        {
          type: { const: "correlated" },
          disposition: { enum: ["new", "suppressed"] },
          threadId: identifier,
          reason: text(2000),
        },
        ["type", "disposition"],
      ),
    ],
  },
  object(
    {
      type: { const: "investigation_updated" },
      threadId: identifier,
      turnId: identifier,
      status: {
        enum: ["queued", "running", "completed", "failed", "cancelled"],
      },
    },
    ["type", "threadId", "turnId", "status"],
  ),
  object(
    {
      type: { const: "writeback_updated" },
      operationId: identifier,
      status: { enum: ["pending", "succeeded", "failed", "not_required"] },
    },
    ["type", "operationId", "status"],
  ),
  object({ type: { const: "deleted" } }, ["type"]),
];

/** JSON Schema and runtime validation share constraints; no runtime dependencies. */
export const INBOUND_LIFECYCLE_EVENT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  ...object(
    {
      schemaVersion: { const: "1" },
      eventId: identifier,
      tenantId: identifier,
      inboundId: identifier,
      sourceEventId: identifier,
      sourceSystemId: identifier,
      bindingRevision: {
        type: "integer",
        minimum: 1,
        maximum: Number.MAX_SAFE_INTEGER,
      },
      revision: {
        type: "integer",
        minimum: 1,
        maximum: Number.MAX_SAFE_INTEGER,
      },
      occurredAt: {
        type: "string",
        // Canonical UTC representation avoids implementation-specific date parsing.
        pattern: UTC_PATTERN.source,
      },
      change: { oneOf: variants },
    },
    [
      "schemaVersion",
      "eventId",
      "tenantId",
      "inboundId",
      "sourceEventId",
      "sourceSystemId",
      "bindingRevision",
      "revision",
      "occurredAt",
      "change",
    ],
  ),
} as const;

/** Structural validation only; the host must attest tenant, origin and grants. */
export function validateInboundLifecycleEvent(
  value: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  check(value, INBOUND_LIFECYCLE_EVENT_SCHEMA, "$", issues);
  return issues;
}

export function isInboundLifecycleEvent(
  value: unknown,
): value is InboundLifecycleEventV1 {
  return validateInboundLifecycleEvent(value).length === 0;
}

type Shape = {
  type?: string;
  const?: unknown;
  enum?: readonly unknown[];
  oneOf?: readonly Shape[];
  properties?: Record<string, Shape>;
  required?: readonly string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
};

function check(
  value: unknown,
  shape: Shape,
  path: string,
  issues: ValidationIssue[],
): void {
  const invalid = () =>
    issues.push({
      path,
      code: "invalid",
      message: "Invalid lifecycle event value.",
    });
  if (shape.oneOf) {
    const matches = shape.oneOf.filter((variant) => {
      const errors: ValidationIssue[] = [];
      check(value, variant, path, errors);
      return errors.length === 0;
    });
    if (matches.length !== 1) invalid();
    return;
  }
  if (Object.hasOwn(shape, "const") && value !== shape.const) invalid();
  if (shape.enum && !shape.enum.includes(value)) invalid();
  if (shape.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      invalid();
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of shape.required ?? []) {
      if (!Object.hasOwn(record, key))
        issues.push({
          path: `${path}.${key}`,
          code: "required",
          message: "Required event field is missing.",
        });
    }
    for (const key of Object.keys(record)) {
      if (!Object.hasOwn(shape.properties ?? {}, key)) {
        issues.push({
          path: `${path}.${key}`,
          code: "unknown-property",
          message: "Unknown lifecycle event field.",
        });
      } else
        check(record[key], shape.properties![key]!, `${path}.${key}`, issues);
    }
  } else if (shape.type === "string") {
    if (typeof value !== "string") {
      invalid();
      return;
    }
    const length = [...value].length;
    if (
      length < (shape.minLength ?? 0) ||
      length > (shape.maxLength ?? Infinity) ||
      (shape.pattern !== undefined &&
        !(
          (shape.pattern === IDENTIFIER_PATTERN.source &&
            IDENTIFIER_PATTERN.test(value)) ||
          (shape.pattern === UTC_PATTERN.source && UTC_PATTERN.test(value))
        ))
    )
      invalid();
  } else if (shape.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < (shape.minimum ?? -Infinity) ||
      value > (shape.maximum ?? Infinity)
    )
      invalid();
  }
}

import type {
  PluginAgentRunBindingV1,
  PluginAgentRunObservationEventV1,
  PluginAgentRunObservedSnapshotV1,
  PluginAgentRunRequestV1,
  PluginAgentRunStateV1,
} from "../contracts/agent-runs.js";
import type { JsonValue } from "../contracts/manifest.js";
import {
  PluginValidationError,
  type ValidationIssue,
} from "../contracts/errors.js";

const ID = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const SETTING_KEY = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const DIGEST = /^[0-9a-f]{64}$/;
const BINDING_KEYS = [
  "id",
  "agentSettingKeys",
  "startActionId",
  "getActionId",
  "cancelActionId",
  "completionHandlerId",
  "presets",
];
const REQUEST_KEYS = [
  "schemaVersion",
  "bindingId",
  "agentSettingKey",
  "instructions",
  "presetId",
  "inputs",
  "outputSchema",
];

export const PLUGIN_AGENT_RUN_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Identifier length shared by bindings and presets. */
export const PLUGIN_AGENT_RUN_ID_MAX_LENGTH = 64;
/** Characters in one manifest preset instruction. */
export const PLUGIN_AGENT_RUN_PRESET_MAX_CHARACTERS = 12_288;
/** UTF-8 bytes of a JSON-encoded output schema. */
export const PLUGIN_AGENT_RUN_OUTPUT_SCHEMA_MAX_BYTES = 8_192;
/**
 * Structural bounds on run JSON. Byte size is host policy: hosts pass their own
 * request bound to `parsePluginAgentRunRequestV1`.
 */
export const PLUGIN_AGENT_RUN_JSON_BOUNDS = {
  maxDepth: 32,
  maxArrayItems: 4_096,
  maxObjectKeys: 512,
} as const;
/** Transport ceiling for one observed state; hosts keep observed output below it. */
export const PLUGIN_AGENT_RUN_STATE_MAX_BYTES = 1_048_576;

const encoder = new TextEncoder();
const jsonBytes = (value: unknown) =>
  encoder.encode(JSON.stringify(value)).byteLength;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}
function boundedId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= PLUGIN_AGENT_RUN_ID_MAX_LENGTH &&
    ID.test(value)
  );
}
function unknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      issues.push(
        issue(
          `${path}.${key}`,
          "unknown-property",
          `Unknown property: ${key}.`,
        ),
      );
}
function fail(issues: ValidationIssue[]): never {
  throw new PluginValidationError(issues);
}

/** Checks JSON shape, structural bounds and unsafe keys; `maxBytes` is optional host policy. */
export function validatePluginAgentRunJson(
  value: unknown,
  path = "$",
  options: { maxBytes?: number } = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<object>();
  const visit = (entry: unknown, at: string, depth: number): boolean => {
    if (depth > PLUGIN_AGENT_RUN_JSON_BOUNDS.maxDepth) {
      issues.push(issue(at, "too-deep", "JSON nesting is too deep."));
      return false;
    }
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "boolean" ||
      (typeof entry === "number" && Number.isFinite(entry))
    )
      return true;
    if (typeof entry !== "object" || seen.has(entry)) {
      issues.push(issue(at, "type", "Value must be JSON."));
      return false;
    }
    seen.add(entry);
    if (Array.isArray(entry)) {
      if (entry.length > PLUGIN_AGENT_RUN_JSON_BOUNDS.maxArrayItems) {
        issues.push(issue(at, "too-large", "JSON array is too large."));
        return false;
      }
      for (const [index, child] of entry.entries())
        if (!visit(child, `${at}[${index}]`, depth + 1)) return false;
    } else {
      const prototype = Object.getPrototypeOf(entry);
      if (prototype !== Object.prototype && prototype !== null) {
        issues.push(issue(at, "type", "Value must be JSON."));
        return false;
      }
      const keys = Object.keys(entry);
      if (keys.length > PLUGIN_AGENT_RUN_JSON_BOUNDS.maxObjectKeys) {
        issues.push(issue(at, "too-large", "JSON object is too large."));
        return false;
      }
      for (const key of keys) {
        if (
          key === "__proto__" ||
          key === "constructor" ||
          key === "prototype"
        ) {
          issues.push(issue(`${at}.${key}`, "unsafe", "Unsafe JSON field."));
          return false;
        }
        if (
          !visit(
            (entry as Record<string, unknown>)[key],
            `${at}.${key}`,
            depth + 1,
          )
        )
          return false;
      }
    }
    seen.delete(entry);
    return true;
  };
  if (
    visit(value, path, 0) &&
    options.maxBytes !== undefined &&
    jsonBytes(value) > options.maxBytes
  )
    issues.push(issue(path, "too-large", "JSON exceeds the host byte limit."));
  return issues;
}

/** Validates one binding. Settings and action references are checked by `validateManifest`. */
export function validatePluginAgentRunBindingV1(
  value: unknown,
  path = "$",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!record(value))
    return [issue(path, "type", "Agent run binding must be an object.")];
  unknownKeys(value, BINDING_KEYS, path, issues);
  for (const key of [
    "id",
    "startActionId",
    "getActionId",
    "cancelActionId",
    "completionHandlerId",
  ])
    if (!boundedId(value[key]))
      issues.push(
        issue(`${path}.${key}`, "invalid", "Use a bounded identifier."),
      );
  const keys = value.agentSettingKeys;
  if (
    !Array.isArray(keys) ||
    keys.length < 1 ||
    keys.length > 8 ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => typeof key !== "string" || !SETTING_KEY.test(key))
  )
    issues.push(
      issue(
        `${path}.agentSettingKeys`,
        "invalid",
        "Declare 1 to 8 distinct setting keys.",
      ),
    );
  if (value.presets !== undefined) {
    if (!Array.isArray(value.presets) || value.presets.length > 16)
      issues.push(
        issue(`${path}.presets`, "invalid", "Declare at most 16 presets."),
      );
    else {
      const ids = new Set<string>();
      for (const [index, preset] of value.presets.entries()) {
        const at = `${path}.presets[${index}]`;
        if (!record(preset)) {
          issues.push(issue(at, "type", "Preset must be an object."));
          continue;
        }
        unknownKeys(preset, ["id", "instructions"], at, issues);
        if (!boundedId(preset.id) || ids.has(preset.id))
          issues.push(issue(`${at}.id`, "invalid", "Use a unique preset id."));
        else ids.add(preset.id);
        if (
          typeof preset.instructions !== "string" ||
          !/\S/.test(preset.instructions) ||
          [...preset.instructions].length >
            PLUGIN_AGENT_RUN_PRESET_MAX_CHARACTERS
        )
          issues.push(
            issue(
              `${at}.instructions`,
              "invalid",
              "Use non-blank instructions of at most 12,288 characters.",
            ),
          );
      }
    }
  }
  return issues;
}

export function parsePluginAgentRunBindingV1(
  value: unknown,
): PluginAgentRunBindingV1 {
  const issues = validatePluginAgentRunBindingV1(value);
  if (issues.length) fail(issues);
  return value as PluginAgentRunBindingV1;
}

/**
 * Bounded output schema subset: primitive types, objects/properties/required,
 * arrays/items, enum and size/number bounds. No references, patterns or transforms.
 */
export function validatePluginAgentRunOutputSchema(
  schema: unknown,
  path = "$",
): ValidationIssue[] {
  const issues = validatePluginAgentRunJson(schema, path, {
    maxBytes: PLUGIN_AGENT_RUN_OUTPUT_SCHEMA_MAX_BYTES,
  });
  if (issues.length) return issues;
  const visit = (node: unknown, at: string, depth: number): void => {
    if (!record(node) || depth > 8) {
      issues.push(issue(at, "unsupported", "Unsupported output schema."));
      return;
    }
    const type = node.type;
    const permitted =
      type === "object"
        ? ["properties", "required", "additionalProperties"]
        : type === "array"
          ? ["items", "minItems", "maxItems"]
          : type === "string"
            ? ["minLength", "maxLength"]
            : type === "number" || type === "integer"
              ? ["minimum", "maximum"]
              : type === "boolean" || type === "null"
                ? []
                : undefined;
    if (!permitted) {
      issues.push(
        issue(`${at}.type`, "invalid", "Use a supported schema type."),
      );
      return;
    }
    for (const key of Object.keys(node))
      if (!["type", "enum", ...permitted].includes(key))
        issues.push(
          issue(
            `${at}.${key}`,
            "unsupported",
            "Keyword does not match its type.",
          ),
        );
    for (const key of ["minLength", "maxLength", "minItems", "maxItems"])
      if (
        node[key] !== undefined &&
        (!Number.isInteger(node[key]) ||
          (node[key] as number) < 0 ||
          (node[key] as number) > 1_048_576)
      )
        issues.push(issue(`${at}.${key}`, "invalid", "Invalid size bound."));
    for (const key of ["minimum", "maximum"])
      if (node[key] !== undefined && typeof node[key] !== "number")
        issues.push(issue(`${at}.${key}`, "invalid", "Invalid number bound."));
    for (const [lower, upper] of [
      ["minLength", "maxLength"],
      ["minItems", "maxItems"],
      ["minimum", "maximum"],
    ] as const)
      if (
        typeof node[lower] === "number" &&
        typeof node[upper] === "number" &&
        node[lower] > node[upper]
      )
        issues.push(issue(`${at}.${lower}`, "invalid", "Inverted bounds."));
    if (node.enum !== undefined) {
      if (
        !Array.isArray(node.enum) ||
        !node.enum.length ||
        node.enum.length > 64 ||
        !node.enum.every((entry) =>
          matchesType(type as string, entry as JsonValue),
        )
      )
        issues.push(
          issue(
            `${at}.enum`,
            "invalid",
            "Use 1 to 64 enum values of the declared type.",
          ),
        );
    }
    if (
      node.additionalProperties !== undefined &&
      typeof node.additionalProperties !== "boolean"
    )
      issues.push(
        issue(
          `${at}.additionalProperties`,
          "invalid",
          "Use a boolean additionalProperties.",
        ),
      );
    if (node.properties !== undefined) {
      if (!record(node.properties) || Object.keys(node.properties).length > 64)
        issues.push(
          issue(
            `${at}.properties`,
            "invalid",
            "Declare at most 64 properties.",
          ),
        );
      else
        for (const [key, child] of Object.entries(node.properties))
          visit(child, `${at}.properties.${key}`, depth + 1);
    }
    if (
      node.required !== undefined &&
      (!Array.isArray(node.required) ||
        new Set(node.required).size !== node.required.length ||
        node.required.some(
          (key) =>
            typeof key !== "string" ||
            !record(node.properties) ||
            !Object.hasOwn(node.properties, key),
        ))
    )
      issues.push(
        issue(
          `${at}.required`,
          "invalid",
          "Require only distinct declared properties.",
        ),
      );
    if (node.items !== undefined) visit(node.items, `${at}.items`, depth + 1);
  };
  visit(schema, path, 0);
  return issues;
}

function matchesType(type: string, value: JsonValue): boolean {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return record(value);
  if (type === "integer")
    return typeof value === "number" && Number.isInteger(value);
  return typeof value === type;
}

/** Checks agent output against a schema accepted by `validatePluginAgentRunOutputSchema`. */
export function matchesPluginAgentRunOutputSchema(
  schema: JsonValue,
  value: JsonValue,
): boolean {
  if (!record(schema) || !matchesType(String(schema.type), value)) return false;
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))
  )
    return false;
  if (typeof value === "string") {
    const length = [...value].length;
    if (
      (typeof schema.minLength === "number" && length < schema.minLength) ||
      (typeof schema.maxLength === "number" && length > schema.maxLength)
    )
      return false;
  }
  if (
    typeof value === "number" &&
    ((typeof schema.minimum === "number" && value < schema.minimum) ||
      (typeof schema.maximum === "number" && value > schema.maximum))
  )
    return false;
  if (Array.isArray(value)) {
    if (
      (typeof schema.minItems === "number" && value.length < schema.minItems) ||
      (typeof schema.maxItems === "number" && value.length > schema.maxItems)
    )
      return false;
    if (
      schema.items !== undefined &&
      !value.every((item) =>
        matchesPluginAgentRunOutputSchema(schema.items!, item),
      )
    )
      return false;
  }
  if (record(value)) {
    const properties = record(schema.properties) ? schema.properties : {};
    if (
      Array.isArray(schema.required) &&
      schema.required.some(
        (key) => typeof key !== "string" || !Object.hasOwn(value, key),
      )
    )
      return false;
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        if (
          !matchesPluginAgentRunOutputSchema(
            properties[key] as JsonValue,
            child as JsonValue,
          )
        )
          return false;
      } else if (schema.additionalProperties === false) return false;
    }
  }
  return true;
}

/**
 * Validates a start request against its binding and resolves preset instructions.
 * `maxRequestBytes` is host policy for the whole accepted request.
 */
export function validatePluginAgentRunRequestV1(
  value: unknown,
  binding: PluginAgentRunBindingV1,
  options: { maxRequestBytes?: number } = {},
): ValidationIssue[] {
  if (!record(value))
    return [issue("$", "type", "Agent run request must be an object.")];
  const issues: ValidationIssue[] = [];
  unknownKeys(value, REQUEST_KEYS, "$", issues);
  if (value.schemaVersion !== "1")
    issues.push(
      issue(
        "$.schemaVersion",
        "unsupported",
        "Request schema version must be 1.",
      ),
    );
  if (value.bindingId !== binding.id)
    issues.push(issue("$.bindingId", "forbidden", "Binding is not permitted."));
  if (
    typeof value.agentSettingKey !== "string" ||
    !binding.agentSettingKeys.includes(value.agentSettingKey)
  )
    issues.push(
      issue(
        "$.agentSettingKey",
        "forbidden",
        "Agent setting is not permitted.",
      ),
    );
  if ((value.instructions === undefined) === (value.presetId === undefined))
    issues.push(
      issue("$", "invalid", "Supply exactly one of instructions or presetId."),
    );
  if (
    value.instructions !== undefined &&
    (typeof value.instructions !== "string" || !/\S/.test(value.instructions))
  )
    issues.push(
      issue(
        "$.instructions",
        "invalid",
        "Instructions must be non-blank text.",
      ),
    );
  if (
    value.presetId !== undefined &&
    !binding.presets?.some((preset) => preset.id === value.presetId)
  )
    issues.push(issue("$.presetId", "invalid", "Unknown preset."));
  if (!Object.hasOwn(value, "inputs"))
    issues.push(issue("$.inputs", "required", "Inputs are required."));
  else issues.push(...validatePluginAgentRunJson(value.inputs, "$.inputs"));
  if (value.outputSchema !== undefined)
    issues.push(
      ...validatePluginAgentRunOutputSchema(
        value.outputSchema,
        "$.outputSchema",
      ),
    );
  if (
    !issues.length &&
    options.maxRequestBytes !== undefined &&
    jsonBytes(value) > options.maxRequestBytes
  )
    issues.push(
      issue("$", "too-large", "Request exceeds the host byte limit."),
    );
  return issues;
}

/** Returns the accepted request with `instructions` resolved from a preset when selected. */
export function parsePluginAgentRunRequestV1(
  value: unknown,
  binding: PluginAgentRunBindingV1,
  options: { maxRequestBytes?: number } = {},
): PluginAgentRunRequestV1 & { readonly instructions: string } {
  const issues = validatePluginAgentRunRequestV1(value, binding, options);
  if (issues.length) fail(issues);
  const request = value as unknown as PluginAgentRunRequestV1;
  const instructions =
    request.instructions ??
    binding.presets!.find((preset) => preset.id === request.presetId)!
      .instructions;
  return { ...request, instructions };
}

/**
 * Canonical JSON hashed for `requestDigest`: object keys sorted by UTF-16 code
 * unit order, no whitespace, primitives encoded as by `JSON.stringify`. The
 * digest is the lowercase hex SHA-256 of this string's UTF-8 bytes.
 */
export function canonicalPluginAgentRunJson(
  value: JsonValue | PluginAgentRunRequestV1,
): string {
  const encode = (entry: unknown): string => {
    if (Array.isArray(entry)) return `[${entry.map(encode).join(",")}]`;
    if (entry !== null && typeof entry === "object")
      return `{${Object.keys(entry)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${encode((entry as Record<string, unknown>)[key])}`,
        )
        .join(",")}}`;
    return JSON.stringify(entry);
  };
  return encode(value);
}

export function isPluginAgentRunRevision(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9][0-9]{0,18}$/.test(value) &&
    BigInt(value) <= 9_223_372_036_854_775_807n
  );
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function timestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
const TERMINAL = ["succeeded", "failed", "cancelled", "access_revoked"];
const FAILED_CODES = [
  "EXECUTION_FAILED",
  "RESULT_INVALID",
  "DEADLINE_EXCEEDED",
];

function consistentSnapshot(row: Record<string, unknown>): boolean {
  const { status, progressCode, deliveryStatus, errorCode } = row;
  const created = Date.parse(row.createdAt as string);
  const started =
    row.startedAt === null ? undefined : Date.parse(row.startedAt as string);
  const ended =
    row.endedAt === null ? undefined : Date.parse(row.endedAt as string);
  if (started !== undefined && started < created) return false;
  if (ended !== undefined && ended < (started ?? created)) return false;
  if (TERMINAL.includes(status as string) !== (ended !== undefined))
    return false;
  if ((status === "succeeded") !== (row.result !== null)) return false;
  if ((status === "succeeded") !== (deliveryStatus !== null)) return false;
  switch (status) {
    case "queued":
      return (
        progressCode === "queued" && started === undefined && errorCode === null
      );
    case "running":
      return (
        (progressCode === "running" || progressCode === "preparing_result") &&
        started !== undefined &&
        errorCode === null
      );
    case "succeeded":
      return (
        progressCode === "delivering_result" &&
        (deliveryStatus === "delivery_failed"
          ? errorCode === "DELIVERY_FAILED"
          : errorCode === null)
      );
    case "failed":
      return FAILED_CODES.includes(errorCode as string);
    case "access_revoked":
      return errorCode === "ACCESS_REVOKED";
    default:
      return errorCode === null;
  }
}

/** Validates one observed state, including status invariants and the transport ceiling. */
export function parsePluginAgentRunStateV1(
  value: unknown,
): PluginAgentRunStateV1 {
  const invalid = (): never =>
    fail([issue("$", "invalid", "Invalid agent run state.")]);
  if (
    !record(value) ||
    !exact(value, ["schemaVersion", "revision", "snapshot"]) ||
    value.schemaVersion !== "1" ||
    !isPluginAgentRunRevision(value.revision)
  )
    return invalid();
  const row = value.snapshot;
  if (
    !record(row) ||
    !exact(row, [
      "runId",
      "bindingId",
      "status",
      "progressCode",
      "deliveryStatus",
      "result",
      "errorCode",
      "createdAt",
      "startedAt",
      "endedAt",
    ]) ||
    typeof row.runId !== "string" ||
    !PLUGIN_AGENT_RUN_ID_PATTERN.test(row.runId) ||
    !boundedId(row.bindingId) ||
    ![
      "queued",
      "running",
      "succeeded",
      "failed",
      "cancelled",
      "access_revoked",
    ].includes(row.status as string) ||
    !["queued", "running", "preparing_result", "delivering_result"].includes(
      row.progressCode as string,
    ) ||
    (row.deliveryStatus !== null &&
      !["pending", "delivering", "delivered", "delivery_failed"].includes(
        row.deliveryStatus as string,
      )) ||
    (row.errorCode !== null &&
      ![...FAILED_CODES, "ACCESS_REVOKED", "DELIVERY_FAILED"].includes(
        row.errorCode as string,
      )) ||
    !timestamp(row.createdAt) ||
    (row.startedAt !== null && !timestamp(row.startedAt)) ||
    (row.endedAt !== null && !timestamp(row.endedAt))
  )
    return invalid();
  if (
    row.result !== null &&
    (!record(row.result) ||
      !exact(row.result, ["kind", "requestDigest", "output"]) ||
      row.result.kind !== "execution_v1" ||
      typeof row.result.requestDigest !== "string" ||
      !DIGEST.test(row.result.requestDigest) ||
      validatePluginAgentRunJson(row.result.output).length)
  )
    return invalid();
  if (!consistentSnapshot(row)) return invalid();
  if (jsonBytes(value) > PLUGIN_AGENT_RUN_STATE_MAX_BYTES) return invalid();
  return {
    schemaVersion: "1",
    revision: value.revision,
    snapshot: row as PluginAgentRunObservedSnapshotV1,
  };
}

export function parsePluginAgentRunObservationEventV1(
  value: unknown,
): PluginAgentRunObservationEventV1 {
  if (record(value) && exact(value, ["type", "state"])) {
    if (value.type === "state")
      return { type: "state", state: parsePluginAgentRunStateV1(value.state) };
    if (
      value.type === "connection" &&
      (value.state === "connecting" ||
        value.state === "live" ||
        value.state === "reconnecting")
    )
      return { type: "connection", state: value.state };
  }
  if (
    record(value) &&
    exact(value, ["type", "reason"]) &&
    value.type === "closed" &&
    (value.reason === "settled" ||
      value.reason === "access_ended" ||
      value.reason === "unavailable")
  )
    return { type: "closed", reason: value.reason };
  return fail([issue("$", "invalid", "Invalid agent run observation event.")]);
}

/** A succeeded run stays observable until delivery reaches a final status. */
export function isPluginAgentRunSettled(snapshot: {
  readonly status: string;
  readonly deliveryStatus: string | null;
}): boolean {
  return snapshot.status === "succeeded"
    ? snapshot.deliveryStatus === "delivered" ||
        snapshot.deliveryStatus === "delivery_failed"
    : ["failed", "cancelled", "access_revoked"].includes(snapshot.status);
}

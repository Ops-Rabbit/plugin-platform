import type { ValidationIssue } from "../contracts/errors.js";

export const CONTRACT_KEY = /^[a-z][a-z0-9_]{0,79}(?![\s\S])/u;
export const CONTRACT_IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}(?![\s\S])/u;
export const CONTRACT_COLUMN = /^[a-z][a-z0-9_]{0,62}(?![\s\S])/u;
export const CONTRACT_MESSAGE_KEY = /^[a-z][a-z0-9_.-]{0,119}(?![\s\S])/u;
export const CONTRACT_UTC =
  /^(?:[0-9]{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12][0-9]|3[01])|(?:0[469]|11)-(?:0[1-9]|[12][0-9]|30)|02-(?:0[1-9]|1[0-9]|2[0-8]))|(?:[0-9]{2}(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29)T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z(?![\s\S])/u;
// Tenant provisioning v1 (canonical host tenant slug, retry keys, mailbox, host paths).
export const CONTRACT_TENANT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/u;
export const CONTRACT_REQUEST_ID = /^[A-Za-z0-9_-]{16,128}(?![\s\S])/u;
export const CONTRACT_EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+(?![\s\S])/u;
// Display text: trimmed, with no control, invisible-format or bidi-override characters and no
// unpaired surrogates, so names cannot hide line breaks or render as a different name. The explicit
// surrogate-pair branch keeps the result the same in schema validators that omit the `u` flag.
export const CONTRACT_TRIMMED_TEXT =
  // eslint-disable-next-line no-control-regex -- control characters are listed so they are rejected.
  /^(?:[^\s\x00-\x1F\x7F-\x9F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uD800-\uDFFF\uFEFF\uFFF9-\uFFFB]|[\uD800-\uDBFF][\uDC00-\uDFFF])(?:(?:[^\x00-\x1F\x7F-\x9F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uD800-\uDFFF\uFEFF\uFFF9-\uFFFB]|[\uD800-\uDBFF][\uDC00-\uDFFF])*(?:[^\s\x00-\x1F\x7F-\x9F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uD800-\uDFFF\uFEFF\uFFF9-\uFFFB]|[\uD800-\uDBFF][\uDC00-\uDFFF]))?(?![\s\S])/u;
export const CONTRACT_CURSOR = /^[A-Za-z0-9_-]{1,512}(?![\s\S])/u;
export const CONTRACT_SHA256 = /^[a-f0-9]{64}(?![\s\S])/u;
export const CONTRACT_RENDER_URL =
  /^(?:https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?)?\/(?![/\\])[A-Za-z0-9._~/%?&=+-]{0,1023}(?![\s\S])/u;
export const CONTRACT_APPS_PATH = /^\/apps\/[a-z][a-z0-9_-]*(?![\s\S])/u;
export const CONTRACT_PRINTABLE_SECRET = /^[\x21-\x7E]{15,128}(?![\s\S])/u;
const patterns = [
  CONTRACT_KEY,
  CONTRACT_IDENTIFIER,
  CONTRACT_COLUMN,
  CONTRACT_MESSAGE_KEY,
  CONTRACT_UTC,
  CONTRACT_TENANT_SLUG,
  CONTRACT_REQUEST_ID,
  CONTRACT_EMAIL,
  CONTRACT_TRIMMED_TEXT,
  CONTRACT_CURSOR,
  CONTRACT_SHA256,
  CONTRACT_RENDER_URL,
  CONTRACT_APPS_PATH,
  CONTRACT_PRINTABLE_SECRET,
];

export type ContractShape = {
  type?: string;
  const?: unknown;
  enum?: readonly unknown[];
  oneOf?: readonly ContractShape[];
  not?: ContractShape;
  properties?: Readonly<Record<string, ContractShape>>;
  propertyNames?: ContractShape;
  additionalProperties?: false | ContractShape;
  required?: readonly string[];
  minProperties?: number;
  maxProperties?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  items?: ContractShape;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
};

/** Internal bounded subset; patterns are fixed, never compiled from input. */
export function contractIssues(
  value: unknown,
  shape: ContractShape,
  path = "$",
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  check(value, shape, path, issues);
  return issues;
}
function check(
  value: unknown,
  shape: ContractShape,
  path: string,
  issues: ValidationIssue[],
): void {
  const invalid = (code: ValidationIssue["code"] = "invalid") =>
    issues.push({ path, code, message: "Invalid bounded contract value." });
  if (shape.not && contractIssues(value, shape.not).length === 0) invalid();
  if (shape.oneOf) {
    if (
      shape.oneOf.filter(
        (variant) => contractIssues(value, variant).length === 0,
      ).length !== 1
    )
      invalid();
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
    const keys = Object.keys(record);
    if (
      keys.length < (shape.minProperties ?? 0) ||
      keys.length > (shape.maxProperties ?? Infinity)
    )
      invalid();
    for (const key of shape.required ?? []) {
      if (!Object.hasOwn(record, key))
        issues.push({
          path: `${path}.${key}`,
          code: "required",
          message: "Required contract field is missing.",
        });
    }
    for (const key of keys) {
      if (shape.propertyNames)
        check(key, shape.propertyNames, `${path}.${key}`, issues);
      const property = Object.hasOwn(shape.properties ?? {}, key)
        ? shape.properties![key]
        : shape.additionalProperties;
      if (!property)
        issues.push({
          path: `${path}.${key}`,
          code: "unknown-property",
          message: "Unknown contract field.",
        });
      else check(record[key], property, `${path}.${key}`, issues);
    }
  } else if (shape.type === "array") {
    if (!Array.isArray(value)) {
      invalid();
      return;
    }
    if (
      value.length < (shape.minItems ?? 0) ||
      value.length > (shape.maxItems ?? Infinity)
    )
      invalid();
    if (shape.uniqueItems && new Set(value).size !== value.length) invalid();
    for (const [index, item] of value.entries())
      if (shape.items) check(item, shape.items, `${path}[${index}]`, issues);
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
        !patterns.some(
          (pattern) => pattern.source === shape.pattern && pattern.test(value),
        ))
    )
      invalid();
  } else if (shape.type === "number" || shape.type === "integer") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (shape.type === "integer" && !Number.isInteger(value)) ||
      value < (shape.minimum ?? -Infinity) ||
      value > (shape.maximum ?? Infinity)
    )
      invalid();
  } else if (shape.type === "boolean" && typeof value !== "boolean") invalid();
  else if (shape.type === "null" && value !== null) invalid();
}

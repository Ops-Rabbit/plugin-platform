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
// The local part is a dot-atom of at most 64 characters: no leading, trailing or doubled dots.
export const CONTRACT_EMAIL =
  /^(?=[^@]{1,64}@)[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+(?![\s\S])/u;
// Display text: trimmed, with no control, invisible-format, blank-rendering or bidi-override
// characters, no unpaired surrogates, and no invisible characters above U+FFFF (format controls,
// tag characters, supplementary variation selectors), so names cannot hide line breaks or text,
// or render blank or as a different name. The pattern matches the same in schema validators
// with and without the `u` flag: complete surrogate pairs have their own branch, and characters
// above U+FFFF are listed as escaped pairs because such a range has no form valid in both modes.
const escapeUnit = (unit: number) =>
  `\\u${unit.toString(16).toUpperCase().padStart(4, "0")}`;
const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);
const UNSAFE_TEXT = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0xad],
  [0x34f],
  [0x61c],
  [0x115f, 0x1160],
  [0x17b4, 0x17b5],
  [0x180b, 0x180f], // Mongolian free variation selectors and vowel separator
  [0x200b], // zero-width space; U+200C and U+200D are needed by emoji and some scripts
  [0x200e, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0x2800],
  [0x3164],
  [0xd800, 0xdfff],
  [0xfe00, 0xfe0d], // variation selectors; U+FE0E and U+FE0F stay for emoji
  [0xfeff],
  [0xffa0],
  [0xfff9, 0xfffb],
]
  .map(([from, to]) =>
    to === undefined
      ? escapeUnit(from!)
      : `${escapeUnit(from!)}-${escapeUnit(to)}`,
  )
  .join("");
const SUPPLEMENTARY_HIDDEN = [
  ...span(0x13430, 0x1343f), // Egyptian hieroglyph format controls
  ...span(0x1bca0, 0x1bca3), // shorthand format controls
  ...span(0x1d173, 0x1d17a), // musical symbol format controls
  0xe0001, // language tag
  ...span(0xe0020, 0xe007f), // tag characters
  ...span(0xe0100, 0xe01ef), // supplementary variation selectors
]
  .map(
    (codePoint) =>
      escapeUnit(0xd800 + ((codePoint - 0x10000) >> 10)) +
      escapeUnit(0xdc00 + ((codePoint - 0x10000) & 0x3ff)),
  )
  .join("|");
const SURROGATE_PAIR = `[${escapeUnit(0xd800)}-${escapeUnit(0xdbff)}][${escapeUnit(0xdc00)}-${escapeUnit(0xdfff)}]`;
const DISPLAY_EDGE = `(?:[^\\s${UNSAFE_TEXT}]|${SURROGATE_PAIR})`;
const DISPLAY_INNER = `(?:[^${UNSAFE_TEXT}]|${SURROGATE_PAIR})`;
export const CONTRACT_TRIMMED_TEXT = new RegExp(
  `^(?![\\s\\S]*(?:${SUPPLEMENTARY_HIDDEN}))${DISPLAY_EDGE}(?:${DISPLAY_INNER}*${DISPLAY_EDGE})?(?![\\s\\S])`,
  "u",
);
// Host-owned text in results (names of existing accounts, tenants renamed in the host): any text
// without control characters, line or paragraph separators, or unpaired surrogates. Plugins
// render it as plain text; the stricter rules above apply only to what a plugin sends.
const HOST_UNSAFE_TEXT = `${escapeUnit(0x00)}-${escapeUnit(0x1f)}${escapeUnit(0x7f)}-${escapeUnit(0x9f)}${escapeUnit(0x2028)}${escapeUnit(0x2029)}${escapeUnit(0xd800)}-${escapeUnit(0xdfff)}`;
export const CONTRACT_HOST_TEXT = new RegExp(
  `^(?:[^${HOST_UNSAFE_TEXT}]|${SURROGATE_PAIR})*(?![\\s\\S])`,
  "u",
);
// Host-owned email in results: one `@` with no whitespace or control characters around it.
const HOST_EMAIL_PART = `[^${escapeUnit(0x00)}-${escapeUnit(0x20)}${escapeUnit(0x7f)}@]+`;
export const CONTRACT_HOST_EMAIL = new RegExp(
  `^${HOST_EMAIL_PART}@${HOST_EMAIL_PART}(?![\\s\\S])`,
  "u",
);
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
  CONTRACT_HOST_TEXT,
  CONTRACT_HOST_EMAIL,
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

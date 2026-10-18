import {
  PLUGIN_CAPTURED_DOCUMENT_CONTENT_TYPES,
  PLUGIN_CAPTURED_DOCUMENT_FORMATS,
  PLUGIN_DOCUMENT_CAPTURE_LIMITS as LIMITS,
  PLUGIN_DOCUMENT_CAPTURE_SCHEMA_VERSION,
  type PluginCapturedDocumentV1,
  type PluginDocumentCaptureAcceptedUrlRequestV1,
  type PluginDocumentCaptureErrorV1,
  type PluginDocumentCaptureResultV1,
  type PluginDocumentCaptureUrlRequestV1,
} from "../contracts/document-capture.js";
import {
  PluginValidationError,
  type ValidationIssue,
} from "../contracts/errors.js";
import { CONTRACT_UTC } from "./bounded-contract.js";

const SHA256 = /^[0-9a-f]{64}$/;
const CODE = /^[a-z][a-z0-9_]{0,63}$/;
const EXTRACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const EXTRACTOR_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** C0 and C1 controls other than tab and line feed. */
// eslint-disable-next-line no-control-regex
const TEXT_CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;
/** All C0 and C1 controls, for single-line values. */
// eslint-disable-next-line no-control-regex
const LINE_CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

const REQUEST_KEYS = [
  "url",
  "maxTextBytes",
  "maxResponseBytes",
  "timeoutMs",
] as const;
const DOCUMENT_KEYS = [
  "schemaVersion",
  "source",
  "fetchedAt",
  "contentType",
  "byteLength",
  "byteSha256",
  "extractor",
  "title",
  "format",
  "text",
  "textBytes",
  "textSha256",
  "truncated",
  "warnings",
] as const;
const SOURCE_KEYS = ["kind", "requestedUrl", "finalUrl", "redirectCount"];
const EXTRACTOR_KEYS = ["id", "version"];
const ERROR_KEYS = ["code", "message", "retryable", "httpStatus"];

const MAX_UNKNOWN_KEYS = 16;

const encoder = new TextEncoder();

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

/**
 * Copies own enumerable data properties of a plain object. Accessors, symbol
 * keys, non-plain prototypes and unknown keys are rejected, so each property
 * is read exactly once and the copy is what the caller later uses.
 */
function plainObject(
  value: unknown,
  path: string,
  allowed: readonly string[],
  issues: ValidationIssue[],
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push(issue(path, "type", "Value must be an object."));
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    issues.push(issue(path, "type", "Value must be a plain object."));
    return undefined;
  }
  const keys = Reflect.ownKeys(value);
  // Bound the work and the issue list for objects with many unknown keys.
  if (keys.length > allowed.length + MAX_UNKNOWN_KEYS) {
    issues.push(issue(path, "invalid", "Object has too many properties."));
    return undefined;
  }
  const copy: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const key of keys) {
    if (typeof key === "symbol") {
      issues.push(issue(path, "invalid", "Symbol keys are not allowed."));
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!allowed.includes(key)) {
      issues.push(
        issue(
          `${path}.${key}`,
          "unknown-property",
          `Unknown property: ${key}.`,
        ),
      );
      continue;
    }
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      issues.push(
        issue(
          `${path}.${key}`,
          "invalid",
          "Property must be an enumerable data property.",
        ),
      );
      continue;
    }
    copy[key] = descriptor.value;
  }
  return copy;
}

/** Copies a dense array of at most `max` data elements. */
function denseArray(
  value: unknown,
  path: string,
  max: number,
  issues: ValidationIssue[],
): unknown[] | undefined {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    issues.push(issue(path, "type", "Value must be an array."));
    return undefined;
  }
  const length = Object.getOwnPropertyDescriptor(value, "length")?.value;
  if (typeof length !== "number" || length > max) {
    issues.push(issue(path, "too-large", `Declare at most ${max} items.`));
    return undefined;
  }
  if (Reflect.ownKeys(value).length !== length + 1) {
    issues.push(
      issue(path, "invalid", "Array must be dense with no extra properties."),
    );
    return undefined;
  }
  const copy: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) {
      issues.push(
        issue(`${path}[${index}]`, "invalid", "Array item must be data."),
      );
      return undefined;
    }
    copy.push(descriptor.value);
  }
  return copy;
}

/** Counts code points; a surrogate pair counts once. */
function characters(value: string): number {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index += 1;
    }
    count += 1;
  }
  return count;
}

function boundedInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issues: ValidationIssue[],
): value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    issues.push(
      issue(
        path,
        "invalid",
        `Value must be an integer from ${minimum} to ${maximum}.`,
      ),
    );
    return false;
  }
  return true;
}

/** Single-line, well-formed, bounded text. */
function lineText(
  value: unknown,
  path: string,
  max: number,
  issues: ValidationIssue[],
): value is string {
  // Each code point is at most two UTF-16 units, so a longer string is
  // rejected before any full-string scan.
  if (typeof value === "string" && value.length > max * 2) {
    issues.push(
      issue(path, "too-long", `Value must be at most ${max} characters.`),
    );
    return false;
  }
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    LINE_CONTROL.test(value) ||
    LONE_SURROGATE.test(value)
  ) {
    issues.push(
      issue(
        path,
        "invalid",
        "Value must be non-empty, single-line, well-formed text.",
      ),
    );
    return false;
  }
  if (characters(value) > max) {
    issues.push(
      issue(path, "too-long", `Value must be at most ${max} characters.`),
    );
    return false;
  }
  return true;
}

function pattern(
  value: unknown,
  path: string,
  expression: RegExp,
  max: number,
  issues: ValidationIssue[],
): value is string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    !expression.test(value)
  ) {
    issues.push(issue(path, "invalid", "Value has an invalid format."));
    return false;
  }
  return true;
}

function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[],
): value is T {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    issues.push(
      issue(path, "invalid", `Value must be one of: ${allowed.join(", ")}.`),
    );
    return false;
  }
  return true;
}

/**
 * Parses an absolute HTTPS URL without credentials. With `canonical`, the
 * value must already be the normalized form the host reports: `URL.href` with
 * no fragment.
 */
function httpsUrl(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  canonical: boolean,
): URL | undefined {
  if (typeof value !== "string" || value === "") {
    issues.push(issue(path, "type", "URL must be a non-empty string."));
    return undefined;
  }
  // Checked before parsing so oversized input is never handed to the parser.
  if (
    value.length > LIMITS.urlCharacters * 2 ||
    characters(value) > LIMITS.urlCharacters
  ) {
    issues.push(
      issue(
        path,
        "too-long",
        `URL must be at most ${LIMITS.urlCharacters} characters.`,
      ),
    );
    return undefined;
  }
  // The URL parser silently strips surrounding whitespace and embedded tabs and
  // newlines, so the raw string could differ from what is fetched; reject them.
  if (LINE_CONTROL.test(value) || value.trim() !== value) {
    issues.push(
      issue(
        path,
        "invalid",
        "URL must not contain control characters or surrounding whitespace.",
      ),
    );
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.push(issue(path, "invalid", "URL must be absolute."));
    return undefined;
  }
  if (url.protocol !== "https:") {
    issues.push(issue(path, "invalid", "URL must use https."));
    return undefined;
  }
  if (url.username !== "" || url.password !== "") {
    issues.push(issue(path, "invalid", "URL must not contain credentials."));
    return undefined;
  }
  url.hash = "";
  if (url.href.length > LIMITS.urlCharacters) {
    issues.push(
      issue(
        path,
        "too-long",
        `Normalized URL must be at most ${LIMITS.urlCharacters} characters.`,
      ),
    );
    return undefined;
  }
  if (canonical && url.href !== value) {
    issues.push(
      issue(path, "invalid", "URL must be normalized and have no fragment."),
    );
    return undefined;
  }
  return url;
}

function fail(issues: ValidationIssue[]): never {
  throw new PluginValidationError(issues);
}

function readRequest(
  value: unknown,
  issues: ValidationIssue[],
): PluginDocumentCaptureAcceptedUrlRequestV1 | undefined {
  const entry = plainObject(value, "$", REQUEST_KEYS, issues);
  if (!entry) return undefined;
  if (!("url" in entry))
    issues.push(issue("$.url", "required", "URL is required."));
  const url =
    "url" in entry ? httpsUrl(entry.url, "$.url", issues, false) : undefined;
  let maxTextBytes: number = LIMITS.defaultMaxTextBytes;
  if (entry.maxTextBytes !== undefined) {
    if (
      boundedInteger(
        entry.maxTextBytes,
        "$.maxTextBytes",
        1,
        LIMITS.maxTextBytes,
        issues,
      )
    )
      maxTextBytes = entry.maxTextBytes;
  }
  // Tighten-only hints: validated here, applied by the host as min() with its limits.
  const hint = (
    key: "maxResponseBytes" | "timeoutMs",
    minimum: number,
    maximum: number,
  ) =>
    entry[key] !== undefined &&
    boundedInteger(entry[key], `$.${key}`, minimum, maximum, issues)
      ? { [key]: entry[key] as number }
      : {};
  const maxResponseBytes = hint(
    "maxResponseBytes",
    LIMITS.minResponseBytes,
    LIMITS.maxResponseBytes,
  );
  const timeoutMs = hint("timeoutMs", LIMITS.minTimeoutMs, LIMITS.maxTimeoutMs);
  if (issues.length || !url) return undefined;
  return Object.freeze({
    url: entry.url as string,
    normalizedUrl: url.href,
    maxTextBytes,
    ...maxResponseBytes,
    ...timeoutMs,
  });
}

/** Validates a capture request; returns issues instead of throwing. */
export function validatePluginDocumentCaptureUrlRequestV1(
  value: unknown,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  readRequest(value, issues);
  return issues;
}

/** Parses a capture request and applies the default text bound. */
export function parsePluginDocumentCaptureUrlRequestV1(
  value: unknown,
): PluginDocumentCaptureAcceptedUrlRequestV1 {
  const issues: ValidationIssue[] = [];
  const request = readRequest(value, issues);
  if (!request) fail(issues);
  return request;
}

function readDocument(
  value: unknown,
  path: string,
  request: PluginDocumentCaptureAcceptedUrlRequestV1 | undefined,
  issues: ValidationIssue[],
): PluginCapturedDocumentV1 | undefined {
  const documentStart = issues.length;
  const entry = plainObject(value, path, DOCUMENT_KEYS, issues);
  if (!entry) return undefined;
  const start = issues.length;
  for (const key of DOCUMENT_KEYS)
    if (!(key in entry))
      issues.push(issue(`${path}.${key}`, "required", `${key} is required.`));
  if (issues.length > start) return undefined;

  if (entry.schemaVersion !== PLUGIN_DOCUMENT_CAPTURE_SCHEMA_VERSION)
    issues.push(
      issue(`${path}.schemaVersion`, "invalid", "Schema version must be 1."),
    );

  const sourcePath = `${path}.source`;
  const sourceEntry = plainObject(
    entry.source,
    sourcePath,
    SOURCE_KEYS,
    issues,
  );
  let source: PluginCapturedDocumentV1["source"] | undefined;
  let crossOrigin = false;
  if (sourceEntry) {
    const sourceStart = issues.length;
    for (const key of SOURCE_KEYS)
      if (!(key in sourceEntry))
        issues.push(
          issue(`${sourcePath}.${key}`, "required", `${key} is required.`),
        );
    if (sourceEntry.kind !== "url")
      issues.push(issue(`${sourcePath}.kind`, "invalid", "Kind must be url."));
    const requested = httpsUrl(
      sourceEntry.requestedUrl,
      `${sourcePath}.requestedUrl`,
      issues,
      true,
    );
    const final = httpsUrl(
      sourceEntry.finalUrl,
      `${sourcePath}.finalUrl`,
      issues,
      true,
    );
    const redirectsValid = boundedInteger(
      sourceEntry.redirectCount,
      `${sourcePath}.redirectCount`,
      0,
      LIMITS.maxRedirects,
      issues,
    );
    if (requested && request && requested.href !== request.normalizedUrl)
      issues.push(
        issue(
          `${sourcePath}.requestedUrl`,
          "invalid",
          "Requested URL must match the normalized request URL.",
        ),
      );
    if (
      requested &&
      final &&
      redirectsValid &&
      sourceEntry.redirectCount === 0 &&
      requested.href !== final.href
    )
      issues.push(
        issue(
          `${sourcePath}.finalUrl`,
          "invalid",
          "Final URL must equal the requested URL when no redirect occurred.",
        ),
      );
    if (issues.length === sourceStart && requested && final) {
      crossOrigin = requested.origin !== final.origin;
      source = Object.freeze({
        kind: "url",
        requestedUrl: requested.href,
        finalUrl: final.href,
        redirectCount: sourceEntry.redirectCount as number,
      });
    }
  }

  if (
    typeof entry.fetchedAt !== "string" ||
    !CONTRACT_UTC.test(entry.fetchedAt)
  )
    issues.push(
      issue(
        `${path}.fetchedAt`,
        "invalid",
        "fetchedAt must be an exact UTC timestamp with milliseconds.",
      ),
    );
  member(
    entry.contentType,
    PLUGIN_CAPTURED_DOCUMENT_CONTENT_TYPES,
    `${path}.contentType`,
    issues,
  );
  // A captured document has a non-empty body, never larger than the requested
  // bound or, without one, the largest response limit a host can apply.
  boundedInteger(
    entry.byteLength,
    `${path}.byteLength`,
    1,
    request?.maxResponseBytes ?? LIMITS.maxResponseBytes,
    issues,
  );
  for (const key of ["byteSha256", "textSha256"] as const) {
    const digest = entry[key];
    if (typeof digest !== "string" || !SHA256.test(digest))
      issues.push(
        issue(
          `${path}.${key}`,
          "invalid",
          "Digest must be 64 lowercase hexadecimal characters.",
        ),
      );
  }

  const extractorPath = `${path}.extractor`;
  const extractorEntry = plainObject(
    entry.extractor,
    extractorPath,
    EXTRACTOR_KEYS,
    issues,
  );
  if (extractorEntry) {
    for (const [key, expression, max] of [
      ["id", EXTRACTOR_ID, LIMITS.extractorIdCharacters],
      ["version", EXTRACTOR_VERSION, LIMITS.extractorVersionCharacters],
    ] as const)
      if (!(key in extractorEntry))
        issues.push(
          issue(`${extractorPath}.${key}`, "required", `${key} is required.`),
        );
      else
        pattern(
          extractorEntry[key],
          `${extractorPath}.${key}`,
          expression,
          max,
          issues,
        );
  }

  if (entry.title !== null)
    lineText(entry.title, `${path}.title`, LIMITS.titleCharacters, issues);
  member(
    entry.format,
    PLUGIN_CAPTURED_DOCUMENT_FORMATS,
    `${path}.format`,
    issues,
  );

  const maxTextBytes = request?.maxTextBytes ?? LIMITS.maxTextBytes;
  const text = entry.text;
  // UTF-8 length is at least UTF-16 length: reject oversized text before scanning it.
  if (typeof text === "string" && text.length > maxTextBytes)
    issues.push(
      issue(
        `${path}.text`,
        "too-long",
        `Text exceeds the ${maxTextBytes}-byte bound.`,
      ),
    );
  else if (
    typeof text !== "string" ||
    text === "" ||
    TEXT_CONTROL.test(text) ||
    LONE_SURROGATE.test(text)
  )
    issues.push(
      issue(
        `${path}.text`,
        "invalid",
        "Text must be non-empty, well-formed and free of control characters other than tab and line feed.",
      ),
    );
  else if (
    boundedInteger(
      entry.textBytes,
      `${path}.textBytes`,
      1,
      maxTextBytes,
      issues,
    ) &&
    // A string's UTF-8 length is at least its UTF-16 length, so skip encoding
    // text that is already known to be too long.
    (text.length > entry.textBytes ||
      encoder.encode(text).byteLength !== entry.textBytes)
  )
    issues.push(
      issue(
        `${path}.textBytes`,
        "invalid",
        "textBytes must equal the UTF-8 length of text.",
      ),
    );

  if (typeof entry.truncated !== "boolean")
    issues.push(
      issue(`${path}.truncated`, "type", "truncated must be a boolean."),
    );
  const warnings = denseArray(
    entry.warnings,
    `${path}.warnings`,
    LIMITS.warnings,
    issues,
  );
  if (warnings) {
    for (const [index, warning] of warnings.entries())
      pattern(warning, `${path}.warnings[${index}]`, CODE, 64, issues);
    if (new Set(warnings).size !== warnings.length)
      issues.push(
        issue(`${path}.warnings`, "duplicate", "Warnings must be unique."),
      );
    if (
      typeof entry.truncated === "boolean" &&
      entry.truncated !== warnings.includes("text_truncated")
    )
      issues.push(
        issue(
          `${path}.warnings`,
          "invalid",
          "text_truncated must be present exactly when truncated is true.",
        ),
      );
    if (source && crossOrigin !== warnings.includes("cross_origin_redirect"))
      issues.push(
        issue(
          `${path}.warnings`,
          "invalid",
          "cross_origin_redirect must be present exactly when the final origin differs from the requested origin.",
        ),
      );
  }

  if (issues.length > documentStart || !source || !warnings || !extractorEntry)
    return undefined;
  return Object.freeze({
    schemaVersion: PLUGIN_DOCUMENT_CAPTURE_SCHEMA_VERSION,
    source,
    fetchedAt: entry.fetchedAt as string,
    contentType: entry.contentType as PluginCapturedDocumentV1["contentType"],
    byteLength: entry.byteLength as number,
    byteSha256: entry.byteSha256 as string,
    extractor: Object.freeze({
      id: extractorEntry.id as string,
      version: extractorEntry.version as string,
    }),
    title: entry.title as string | null,
    format: entry.format as PluginCapturedDocumentV1["format"],
    text: text as string,
    textBytes: entry.textBytes as number,
    textSha256: entry.textSha256 as string,
    truncated: entry.truncated as boolean,
    warnings: Object.freeze(warnings as string[]),
  });
}

function readError(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PluginDocumentCaptureErrorV1 | undefined {
  const entry = plainObject(value, path, ERROR_KEYS, issues);
  if (!entry) return undefined;
  const start = issues.length;
  for (const key of ["code", "message", "retryable"])
    if (!(key in entry))
      issues.push(issue(`${path}.${key}`, "required", `${key} is required.`));
  if (issues.length > start) return undefined;
  pattern(entry.code, `${path}.code`, CODE, 64, issues);
  lineText(entry.message, `${path}.message`, LIMITS.messageCharacters, issues);
  if (typeof entry.retryable !== "boolean")
    issues.push(
      issue(`${path}.retryable`, "type", "retryable must be a boolean."),
    );
  if (entry.code === "http_error") {
    if (entry.httpStatus === undefined)
      issues.push(
        issue(
          `${path}.httpStatus`,
          "required",
          "httpStatus is required for http_error.",
        ),
      );
    else
      boundedInteger(entry.httpStatus, `${path}.httpStatus`, 400, 599, issues);
  } else if (entry.httpStatus !== undefined)
    issues.push(
      issue(
        `${path}.httpStatus`,
        "invalid",
        "httpStatus is allowed only for http_error.",
      ),
    );
  if (issues.length > start) return undefined;
  return Object.freeze({
    code: entry.code as string,
    message: entry.message as string,
    retryable: entry.retryable as boolean,
    ...(entry.httpStatus === undefined
      ? {}
      : { httpStatus: entry.httpStatus as number }),
  });
}

function readResult(
  value: unknown,
  request: PluginDocumentCaptureUrlRequestV1 | undefined,
  issues: ValidationIssue[],
): PluginDocumentCaptureResultV1 | undefined {
  let accepted: PluginDocumentCaptureAcceptedUrlRequestV1 | undefined;
  if (request !== undefined) {
    const requestIssues: ValidationIssue[] = [];
    // Copy own data properties once, so getters never run. An accepted
    // request is also allowed: its derived normalizedUrl is dropped and recomputed.
    const copy = plainObject(
      request,
      "$",
      [...REQUEST_KEYS, "normalizedUrl"],
      requestIssues,
    );
    if (copy) {
      delete copy.normalizedUrl;
      accepted = readRequest(copy, requestIssues);
    }
    if (!accepted) {
      issues.push(
        ...requestIssues.map((entry) => ({
          ...entry,
          path: entry.path.replace(/^\$/, "$request"),
        })),
      );
      return undefined;
    }
  }
  const entry = plainObject(value, "$", ["ok", "document", "error"], issues);
  if (!entry) return undefined;
  if (entry.ok === true) {
    if ("error" in entry)
      issues.push(
        issue("$.error", "invalid", "A successful result has no error."),
      );
    const document = readDocument(
      entry.document,
      "$.document",
      accepted,
      issues,
    );
    return document && !issues.length
      ? Object.freeze({ ok: true as const, document })
      : undefined;
  }
  if (entry.ok === false) {
    if ("document" in entry)
      issues.push(
        issue("$.document", "invalid", "A failed result has no document."),
      );
    const error = readError(entry.error, "$.error", issues);
    return error && !issues.length
      ? Object.freeze({ ok: false as const, error })
      : undefined;
  }
  issues.push(issue("$.ok", "invalid", "ok must be a boolean."));
  return undefined;
}

/**
 * Validates a capture result. With `request`, the result must also belong to
 * it: matching requested URL and text within its `maxTextBytes`.
 */
export function validatePluginDocumentCaptureResultV1(
  value: unknown,
  request?: PluginDocumentCaptureUrlRequestV1,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  readResult(value, request, issues);
  return issues;
}

/**
 * Parses a capture result into a frozen copy. Unknown error and warning codes
 * that are well formed are accepted for forward compatibility.
 */
export function parsePluginDocumentCaptureResultV1(
  value: unknown,
  request?: PluginDocumentCaptureUrlRequestV1,
): PluginDocumentCaptureResultV1 {
  const issues: ValidationIssue[] = [];
  const result = readResult(value, request, issues);
  if (!result) fail(issues);
  return result;
}

/**
 * Recomputes the SHA-256 of a parsed document's text with Web Crypto and
 * compares it with `textSha256`.
 */
export async function verifyPluginCapturedDocumentTextV1(
  document: Pick<PluginCapturedDocumentV1, "text" | "textSha256">,
): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto is required to verify text.");
  const digest = new Uint8Array(
    await subtle.digest("SHA-256", encoder.encode(document.text)),
  );
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return hex === document.textSha256;
}

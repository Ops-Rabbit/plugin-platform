/**
 * Host document capture. The host fetches and extracts content under tenant
 * Web Access policy; plugins receive bounded text with lineage and never open
 * the network connection themselves.
 */

export const PLUGIN_DOCUMENT_CAPTURE_SCHEMA_VERSION = "1" as const;

/** Sources a binding may request. New sources add a service method. */
export const PLUGIN_DOCUMENT_CAPTURE_SOURCES = ["url"] as const;
export type PluginDocumentCaptureSource =
  (typeof PLUGIN_DOCUMENT_CAPTURE_SOURCES)[number];

export const PLUGIN_DOCUMENT_CAPTURE_LIMITS = Object.freeze({
  /** Characters in a request or result URL. */
  urlCharacters: 2_048,
  /** UTF-8 bytes of returned text when the request sets no bound. */
  defaultMaxTextBytes: 262_144,
  /** Largest `maxTextBytes` a request may set. */
  maxTextBytes: 1_048_576,
  /**
   * Range of the optional `maxResponseBytes` hint, matching the tenant Web
   * Access response limit. A hint only lowers the host's effective limit.
   */
  minResponseBytes: 16_384,
  maxResponseBytes: 10_485_760,
  /** Range of the optional `timeoutMs` hint. A hint only shortens the host deadline. */
  minTimeoutMs: 1_000,
  maxTimeoutMs: 120_000,
  maxRedirects: 10,
  /** Characters in a document title. */
  titleCharacters: 1_024,
  /** Characters in an error message. */
  messageCharacters: 512,
  /** Characters in an extractor id. */
  extractorIdCharacters: 128,
  /** Characters in an extractor version. */
  extractorVersionCharacters: 64,
  /** Warnings on one document. */
  warnings: 16,
});

export const PLUGIN_CAPTURED_DOCUMENT_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "application/pdf",
] as const;
export type PluginCapturedDocumentContentType =
  (typeof PLUGIN_CAPTURED_DOCUMENT_CONTENT_TYPES)[number];

export const PLUGIN_CAPTURED_DOCUMENT_FORMATS = [
  "markdown",
  "plain_text",
] as const;
export type PluginCapturedDocumentFormat =
  (typeof PLUGIN_CAPTURED_DOCUMENT_FORMATS)[number];

/**
 * A string that is not one of the listed codes. Hosts may add codes without a
 * schema version change; treat an unknown code as advisory (warnings) or as a
 * generic, non-retryable-unless-flagged failure (errors).
 */
export type PluginDocumentCaptureUnknownCode = string & {
  readonly __unknownDocumentCaptureCode?: never;
};

/** Warnings known to this SDK. */
export const PLUGIN_DOCUMENT_CAPTURE_WARNINGS = [
  "text_truncated",
  "cross_origin_redirect",
] as const;
export type PluginDocumentCaptureKnownWarning =
  (typeof PLUGIN_DOCUMENT_CAPTURE_WARNINGS)[number];
export type PluginDocumentCaptureWarning =
  | PluginDocumentCaptureKnownWarning
  | PluginDocumentCaptureUnknownCode;

/** Error codes known to this SDK. */
export const PLUGIN_DOCUMENT_CAPTURE_ERROR_CODES = [
  "web_access_disabled",
  "url_rejected",
  "http_error",
  "network_error",
  "fetch_failed",
  "timeout",
  "unsupported_content",
  "too_large",
  "extraction_failed",
  "no_readable_text",
  "capacity_exceeded",
] as const;
export type PluginDocumentCaptureKnownErrorCode =
  (typeof PLUGIN_DOCUMENT_CAPTURE_ERROR_CODES)[number];
export type PluginDocumentCaptureErrorCode =
  | PluginDocumentCaptureKnownErrorCode
  | PluginDocumentCaptureUnknownCode;

/**
 * Binds host capture to declared invocations. Bound actions must use
 * `external` risk and must not be deployment-admin actions. Declare at least
 * one of `actionIds` or `scheduledJobIds`.
 */
export interface PluginDocumentCaptureCapabilityV1 {
  readonly schemaVersion: typeof PLUGIN_DOCUMENT_CAPTURE_SCHEMA_VERSION;
  readonly sources: readonly [
    PluginDocumentCaptureSource,
    ...PluginDocumentCaptureSource[],
  ];
  readonly actionIds?: readonly [string, ...string[]];
  readonly scheduledJobIds?: readonly [string, ...string[]];
}

export interface PluginDocumentCaptureUrlRequestV1 {
  /**
   * Absolute `https:` URL without username or password. The fragment is
   * ignored. The host applies its own destination, port and domain policy.
   */
  readonly url: string;
  /** UTF-8 byte bound for returned text; longer text is truncated and flagged. */
  readonly maxTextBytes?: number;
  /**
   * Tighten-only bound, 16,384–10,485,760, on the decoded response body. The
   * effective limit is the smallest of this, the tenant Web Access limit and
   * the host ceiling; it never raises either. A larger body fails `too_large`.
   */
  readonly maxResponseBytes?: number;
  /**
   * Tighten-only deadline, 1,000–120,000 ms, for the whole capture (fetch and
   * extraction). The effective deadline is the smaller of this and the host
   * deadline; it never extends it. A missed deadline fails `timeout`.
   */
  readonly timeoutMs?: number;
}

/**
 * A request after validation, with the default text bound applied. The
 * tighten-only hints stay absent when the request omitted them.
 */
export interface PluginDocumentCaptureAcceptedUrlRequestV1 {
  readonly url: string;
  /** The URL as the host requests it: normalized, without fragment. */
  readonly normalizedUrl: string;
  readonly maxTextBytes: number;
  readonly maxResponseBytes?: number;
  readonly timeoutMs?: number;
}

export interface PluginCapturedDocumentSourceV1 {
  readonly kind: "url";
  /** Requested URL after normalization, fragment removed. */
  readonly requestedUrl: string;
  /** URL of the captured response, after redirects. */
  readonly finalUrl: string;
  readonly redirectCount: number;
}

export interface PluginCapturedDocumentExtractorV1 {
  readonly id: string;
  /** Changes whenever extractor output for the same bytes can change. */
  readonly version: string;
}

export interface PluginCapturedDocumentV1 {
  readonly schemaVersion: typeof PLUGIN_DOCUMENT_CAPTURE_SCHEMA_VERSION;
  readonly source: PluginCapturedDocumentSourceV1;
  /** Host time, exact UTC milliseconds, when the body was fully received. */
  readonly fetchedAt: string;
  readonly contentType: PluginCapturedDocumentContentType;
  /** Length and SHA-256 of the decoded (content-encoding removed) body. */
  readonly byteLength: number;
  readonly byteSha256: string;
  readonly extractor: PluginCapturedDocumentExtractorV1;
  readonly title: string | null;
  readonly format: PluginCapturedDocumentFormat;
  /**
   * Canonical text: non-empty, line feeds only, no control characters other
   * than tab and line feed, no lone surrogates.
   */
  readonly text: string;
  /** UTF-8 length and lowercase hex SHA-256 of `text` exactly as returned. */
  readonly textBytes: number;
  readonly textSha256: string;
  /** True exactly when `warnings` contains `text_truncated`. */
  readonly truncated: boolean;
  readonly warnings: readonly PluginDocumentCaptureWarning[];
}

export interface PluginDocumentCaptureErrorV1 {
  readonly code: PluginDocumentCaptureErrorCode;
  /** Host-authored, user-safe message. Never contains fetched content. */
  readonly message: string;
  readonly retryable: boolean;
  /** Upstream status 400–599; present exactly when `code` is `http_error`. */
  readonly httpStatus?: number;
}

export type PluginDocumentCaptureResultV1 =
  | { readonly ok: true; readonly document: PluginCapturedDocumentV1 }
  | { readonly ok: false; readonly error: PluginDocumentCaptureErrorV1 };

/** Optional, host-authorized, tenant-scoped document capture broker. */
export interface PluginDocumentCaptureServiceV1 {
  /**
   * Expected capture failures resolve as `{ ok: false }`. If the enclosing
   * invocation is cancelled, the promise rejects with that invocation's
   * `signal.reason`; cancellation is never converted into an error result.
   * A malformed request or lost authority rejects with an error.
   */
  fromUrl(
    request: PluginDocumentCaptureUrlRequestV1,
  ): Promise<PluginDocumentCaptureResultV1>;
}

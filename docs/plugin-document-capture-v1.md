# Plugin document capture v1

Introduced in SDK 0.32.0. A plugin can ask a compatible host to fetch a public
web document and return its readable text with lineage. The plugin never opens
the network connection itself, so tenant Web Access policy, egress safety and
audit stay with the host.

The manifest declaration requests access; it grants nothing. The capability is
available at runtime only on a host that implements this contract (OpsRabbit
0.10.0 or later). Callers must check that `context.documentCapture` is present.

## Declaration

```json
"documentCapture": {
  "schemaVersion": "1",
  "sources": ["url"],
  "actionIds": ["capture-document"],
  "scheduledJobIds": ["refresh-document"]
}
```

| Field             | Meaning                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sources`         | Non-empty, unique list. `"url"` is the only v1 source; later sources add a service method rather than changing `fromUrl`.      |
| `actionIds`       | 1 to 64 unique ids from `capabilities.actions`. Each action must use `risk: "external"` and must not be `deploymentAdminOnly`. |
| `scheduledJobIds` | 1 to 64 unique ids from `capabilities.scheduledJobs`.                                                                          |

Declare at least one of `actionIds` or `scheduledJobIds`. The JSON Schema checks
the shape. Runtime validation also checks that each id refers to a declared
action or job, and enforces the risk and deployment-admin rules.

Set `minimumOpsRabbitVersion` to `0.10.0` or later; runtime validation rejects
a manifest that declares `documentCapture` without it. Older SDKs, CLIs and
hosts reject any manifest that declares `documentCapture`.

## Runtime

```ts
if (!context.documentCapture)
  throw new PluginActionError(409, "capture_unavailable", "Not available.");
const result = await context.documentCapture.fromUrl({
  url,
  maxTextBytes: 65_536,
});
if (!result.ok)
  throw new PluginActionError(422, "capture_failed", result.error.message);
const { text, textSha256, source, extractor, fetchedAt } = result.document;
```

The broker is backend-only. It appears only in bound actions and bound
scheduled jobs. Tools, routes, ingress handlers, completion handlers, frontend
modules and agent runtimes never receive it.

### Request

| Field              | Rule                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`              | Absolute `https:` URL of at most 2,048 characters, without username or password, control characters or surrounding whitespace. The fragment is ignored. |
| `maxTextBytes`     | Optional integer from 1 to 1,048,576; default 262,144. It bounds the UTF-8 size of the returned text. Longer text is truncated.                         |
| `maxResponseBytes` | Optional integer from 16,384 to 10,485,760, the tenant Web Access response-limit range. Tighten-only; see below.                                        |
| `timeoutMs`        | Optional integer from 1,000 to 120,000. Tighten-only deadline for the whole capture (fetch and extraction); see below.                                  |

`parsePluginDocumentCaptureUrlRequestV1` returns the request with the default
applied and the normalized URL (`normalizedUrl`, which is `URL.href` without the
fragment). The host fetches `normalizedUrl`. The hints stay absent when the request omits them.

#### Tighten-only hints

`maxResponseBytes` and `timeoutMs` can only lower the host's limits. They never
raise a tenant or host limit, so a value above the effective limit is accepted
and has no effect.

| Hint               | Effective limit                                                                                                                                                 | When exceeded |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `maxResponseBytes` | the smallest of the hint, the tenant Web Access `max_response_bytes` and the host ceiling (2,000,000 on OpsRabbit 0.10.0), applied to the decoded response body | `too_large`   |
| `timeoutMs`        | the smaller of the hint and the host capture deadline (60,000 ms on OpsRabbit 0.10.0), covering fetch, extraction queueing and extraction                       | `timeout`     |

The network fetch keeps its own bound: the smallest of the tenant
`request_timeout_ms`, the host fetch ceiling (30,000 ms) and the time left
before the capture deadline. With `maxResponseBytes`, a successful document
always has `byteLength` at or below the hint, and
`parsePluginDocumentCaptureResultV1(result, request)` rejects one that does
not. Use the hints to keep a capture inside an action's own budget, for example
a short `timeoutMs` in an interactive action.

The host applies its own rules on top. Only public addresses and the standard
port are allowed, every DNS answer is pinned, and the tenant domain lists apply.

### Document

`PluginCapturedDocumentV1`:

| Field                      | Meaning                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `source.requestedUrl`      | The normalized request URL.                                                                                          |
| `source.finalUrl`          | URL of the captured response after redirects. It equals `requestedUrl` when `redirectCount` is 0.                    |
| `source.redirectCount`     | 0 to 10.                                                                                                             |
| `fetchedAt`                | Exact UTC timestamp with milliseconds, taken when the body was fully received.                                       |
| `contentType`              | `text/html`, `application/xhtml+xml`, `text/plain`, `text/markdown` or `application/pdf`.                            |
| `byteLength`, `byteSha256` | Length and SHA-256 of the decoded body, after content encoding is removed.                                           |
| `extractor`                | Host extractor `id` and `version`. The version changes whenever output for the same bytes can change.                |
| `title`                    | Single-line title of up to 1,024 characters, or `null`.                                                              |
| `format`                   | `markdown` for HTML and Markdown sources, `plain_text` otherwise.                                                    |
| `text`                     | Canonical text; details below.                                                                                       |
| `textBytes`, `textSha256`  | UTF-8 length and lowercase hex SHA-256 of `text` exactly as returned.                                                |
| `truncated`                | True exactly when `warnings` contains `text_truncated`.                                                              |
| `warnings`                 | Unique advisory codes. `cross_origin_redirect` appears exactly when the final origin differs from the requested one. |

`text` is always non-empty and well-formed (no lone surrogates). Line endings
are line feeds only, and it contains no control characters other than tab and
line feed. These rules, and the fixed extractor version, make the result
reproducible for the same bytes. `textSha256` is therefore a stable content
identity for lineage.

### Failures and cancellation

Expected failures resolve as `{ ok: false, error: { code, message, retryable,
httpStatus? } }`. The known codes are:

- `web_access_disabled`
- `url_rejected`
- `http_error`
- `network_error`
- `fetch_failed`
- `timeout`
- `unsupported_content`
- `too_large`
- `extraction_failed`
- `no_readable_text`
- `capacity_exceeded`

`httpStatus` (400–599) is present exactly when the code is `http_error`.
Messages are host-authored, single-line and never contain fetched content.

Error and warning codes are open. A newer host may return a code this SDK does
not list. Treat an unknown error code as a generic failure, respecting its
`retryable` flag, and treat an unknown warning as advisory. Content types,
formats and the document shape are closed; changing them requires document
schema version 2.

The promise rejects, rather than resolving, in three cases:

- the invocation is cancelled, in which case it rejects with `signal.reason`
  and never with an error result;
- the request is malformed (`PluginValidationError`);
- the host finds that live authority was lost.

### Validation

- `parsePluginDocumentCaptureResultV1(value, request?)` returns a frozen copy of
  a valid result. With `request`, it also checks that `requestedUrl` matches the
  request and that `textBytes` does not exceed its `maxTextBytes`.
- The validators read own data properties once. They reject:
  - accessors, symbol keys and non-plain objects;
  - sparse arrays;
  - unknown keys.
- `verifyPluginCapturedDocumentTextV1(document)` recomputes `textSha256` with
  Web Crypto. Use it before relying on a stored capture.

## Host responsibilities

The host decides whether a capture happens and owns everything about it:

- **Authority.** It checks live authority before fetching and again before
  returning.
  - **Actions:** the user's session, role ceiling and tenant membership, plugin
    enablement, and that the same registration and action are still active.
  - **Scheduled jobs:** plugin enablement, and that the same registration and
    job are still active.
- **Policy.** Tenant Web Access must be enabled with content fetching. Domain
  allow and deny lists apply to the requested URL and to every redirect hop.
- **Network safety.** Public HTTPS only, DNS-pinned, at most 10 redirects, each
  hop re-validated.
- **Limits.** The host sets response size, deadline, PDF page count,
  concurrency and per-tenant capture budgets. They are host policy, not
  contract constants. Request hints can only lower the response size and
  deadline.
- **Extraction.** HTML and Markdown become readable Markdown. Text-readable PDFs
  are extracted with OCR off; a PDF that needs OCR fails with
  `unsupported_content`.
- **Audit and data.** The host writes one audit event per capture with host
  names, hashes, sizes and outcome, but never the URL path, query or text. It
  stores no captured content.

The plugin owns what it does with the result. Captured text is untrusted
third-party content. Before storing any of it, define its tenant scope,
retention, deletion and lineage. Keep it out of logs.

## Testing

- `createTestContext({ documentCapture })` injects a fake broker.
- `createAuthorizedTestContext(manifest, invocation, { documentCapture })`
  exposes the fake only to bound invocations that pass the manifest rules. It
  also:
  - validates each request before calling the fake;
  - rejects with `signal.reason` when the invocation is cancelled, before or
    after the fake runs;
  - validates the fake's result against the request;
  - rejects a result whose `textSha256` does not match `text`.

The `document-capture` starter shows one external action and one scheduled job.
It maps errors to stable action codes and fails closed when the broker is
absent.

## Future work

- Uploaded-object sources through the object-store broker.
- An optional OCR mode, and PDFs that mix text and scanned pages.
- Host-attested capture receipts that a plugin can store and re-verify later.

# Plugin document capture v1

## Scope

Add the optional `documentCapture` capability to public SDK and CLI 0.32.0. A
plugin declares which actions or scheduled jobs may ask the host to fetch a
public URL. The host fetches it under tenant Web Access policy, extracts
readable text, and returns that text with lineage: requested and final URL,
redirect count, byte and text SHA-256, and extractor identity. Plugins never
open the network connection themselves. Any plugin may declare the capability;
nothing in it is specific to one plugin or domain.

The capability replaces an unpublished candidate, commit `78e8ab1` on
`feat/incetna-document-capture`, that was built on the pre-merge 0.25
agent-runs stack. That candidate was never released. This plan ports it to
main (0.31.1), generalizes it, and fixes the review findings below.

Non-goals for v1:

- uploaded-object or other non-URL sources;
- OCR, JavaScript rendering, crawling, authenticated or credentialed URLs;
- capture retention, sealing or storage brokers;
- exposure to tools, routes, ingress, completion handlers or frontend modules;
- plugin-supplied extractor options or limits beyond `maxTextBytes`.

Each of these needs its own reviewed contract. New sources go behind the
`sources` list and a new service method; they do not change `fromUrl`.

## Review findings fixed by this port

Findings in the `78e8ab1` candidate:

1. The request URL was only type-checked. Any length or non-HTTPS string
   passed SDK validation.
2. Validators read through getters and prototypes. They returned the caller's
   object, not a validated copy, and a sparse `warnings` array passed.
3. The result was not tied to its request:
   - `textBytes` could exceed the requested `maxTextBytes`;
   - `requestedUrl` was not compared with the request;
   - `redirectCount: 0` with a different `finalUrl` passed.
4. Consistency rules were not enforced:
   - `truncated` and the `text_truncated` warning could disagree;
   - `cross_origin_redirect` could disagree with the URLs.
5. Text and timestamps were under-checked:
   - lone surrogates passed, so `textBytes` disagreed with a UTF-8 hash;
   - control characters were documented as removed but never checked;
   - `fetchedAt` accepted impossible dates such as `2026-02-30`.
6. Error results were under-specified:
   - `httpStatus` could be 1xx–3xx, or appear on a code other than `http_error`;
   - there was no `timeout` code;
   - closed enums meant a newer host's code broke older SDK parsers.
7. Cancellation was described in prose only. The test harness neither checked
   nor propagated the invocation signal.
8. Only actions could be bound, and the example lived in the agent-run starter
   with plugin-specific wording.

## Design

### Manifest

```json
"documentCapture": {
  "schemaVersion": "1",
  "sources": ["url"],
  "actionIds": ["capture-document"],
  "scheduledJobIds": ["refresh-documents"]
}
```

- `sources` is a non-empty, unique list. `"url"` is the only v1 value.
- At least one of `actionIds` or `scheduledJobIds` is required. Each list holds
  1–64 unique ids that must already be declared in `capabilities.actions` or
  `capabilities.scheduledJobs`.
- A bound action must use `risk: "external"` and must not be
  `deploymentAdminOnly`. The JSON Schema cannot express this cross-reference;
  runtime validation enforces it.
- The candidate's manifest shape (`schemaVersion`, `sources`, `actionIds`)
  remains valid unchanged.

### Runtime

`context.documentCapture?.fromUrl({ url, maxTextBytes? })` resolves to one of:

- `{ ok: true, document: PluginCapturedDocumentV1 }`;
- `{ ok: false, error: PluginDocumentCaptureErrorV1 }`.

Expected capture failures resolve rather than reject. The promise rejects only
when the invocation is cancelled, when the request is malformed, or when
authority is lost.

**Request.** `url` is an absolute `https:` URL of at most 2,048 characters with
no username or password; its fragment is ignored. `maxTextBytes` is an integer
from 1 to 1,048,576; the default is 262,144. The host applies its own
destination, port, DNS and domain policy on top of this.

**Document.** The document shape is unchanged from the candidate, so existing
consumers keep working. The validator now also enforces:

- URLs: `requestedUrl` equals the normalized request URL with the fragment
  removed. Both URLs are HTTPS without credentials or fragment. With no
  redirect, `finalUrl` equals `requestedUrl`. `redirectCount` is at most 10.
- Timestamp: `fetchedAt` is exact UTC in the
  `YYYY-MM-DDTHH:mm:ss.sssZ` form.
- Hashes: `byteSha256` and `textSha256` are 64-character lowercase hex.
  `byteLength` is a non-negative safe integer.
- Text:
  - non-empty, with no lone surrogates;
  - no control characters other than tab and line feed;
  - `textBytes` equals its UTF-8 length and does not exceed the request's
    `maxTextBytes`.
- Title: `title` is null or at most 1,024 characters, under the same character
  rules as `text`.
- Extractor: `id` and `version` are bounded identifiers.
- Warnings: `warnings` is a unique dense list.
  - `truncated` is true exactly when `text_truncated` is present.
  - `cross_origin_redirect` is present exactly when the requested and final
    origins differ.

**Error.** `code` is a lowercase identifier and `message` is host-authored
text of 1–512 characters. `retryable` is a boolean. `httpStatus` (400–599) is
required for `http_error` and forbidden on every other code.

The SDK lists the known codes:

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

**Forward compatibility.** Error and warning codes are open: the parser
accepts any well-formed code, and plugins must treat an unknown code as a
generic failure or advisory. `contentType`, `format` and the document shape
stay closed. Changing any of them requires document schema version 2.

**Validation.** Validators read own data properties only. They reject accessor
properties, non-plain prototypes, symbol keys, sparse arrays, unknown keys and
shared references. They return a frozen copy, so the value that was validated
is the value the caller uses. The exports are:

- `parsePluginDocumentCaptureUrlRequestV1(value)`, which returns the request
  with the default applied;
- `parsePluginDocumentCaptureResultV1(value, request?)`, which ties the result
  to that request when one is given;
- `verifyPluginCapturedDocumentTextV1(document)`, which recomputes `textSha256`
  with Web Crypto.

**Cancellation.** If the invocation signal aborts, `fromUrl` rejects with
`signal.reason`. Cancellation never becomes `timeout` or another error result.
The harness enforces this both before and after the fake broker runs.

### Testing and starter

- `createTestContext({ documentCapture })` injects a fake broker.
- `createAuthorizedTestContext` exposes a supplied fake only to bound
  invocations that pass the same risk and deployment-admin rules as the
  manifest. It parses each request, checks cancellation, and parses the result
  against that request.
- A new `document-capture` starter has:

  - one external action;
  - one scheduled job binding;
  - error mapping to `PluginActionError`;
  - tests for success, failure results, an unbound invocation and
    cancellation.

  Its `minimumOpsRabbitVersion` is `0.10.0`, the host version that ships the
  broker.

## Compatibility

The change is additive only:

- Manifests, registrations and workspaces that do not declare the capability
  validate exactly as before.
- No export, field, enum or requirement is removed.
- The candidate's manifest shape, request and document fields stay valid. A
  plugin built against the candidate needs only a version bump, plus handling
  for `timeout` and other unknown error codes.

Older SDK versions, older CLIs and older hosts reject manifests that declare
`documentCapture`, because `capabilities` is closed. Plugins must set
`minimumOpsRabbitVersion` to `0.10.0` or later, check that
`context.documentCapture` is present, and fail closed when it is absent.

Schema changes:

- add `capabilities.documentCapture`, with the `anyOf` binding rule;
- add `documentCaptureSource`.

## Authorization and data lifecycle

| Path                                          | Declared by the plugin       | Enforced by the host                                                                                                                                                                                      |
| --------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broker present                                | Binding in `documentCapture` | Invocation kind and id are bound; action is external and not deployment-admin; tenant-scoped                                                                                                              |
| Each `fromUrl` call                           | —                            | Live authority before fetch and before return:<br>• actions: user role, tenant membership, plugin enablement, the registration is still current<br>• jobs: plugin enablement, the job is still registered |
| Network egress                                | —                            | Tenant Web Access enabled with content fetching; domain allow and deny lists on every hop; public HTTPS and pinned DNS only; host size, time and capacity limits                                          |
| Tools, routes, ingress, completions, frontend | Not declarable               | Broker absent                                                                                                                                                                                             |

Declarations request access; they never grant it.

The SDK persists nothing. The host stores no captured content and writes one
audit event per capture, containing host names, hashes, sizes and outcome but
never paths, queries or text. Whatever a plugin does with captured text, it
owns that data's retention, lineage and deletion. The guide
`docs/plugin-document-capture-v1.md` states this split.

## Rollout

1. Release SDK and CLI 0.32.0 together.
2. Pin the published version in a host that implements the broker
   (OpsRabbit 0.10.0).
3. Consumers move to the published version and raise their
   `minimumOpsRabbitVersion`.

Rollback: remove the capability from the plugin manifest. Nothing persisted
needs migrating.

## Verification

- Manifest: positive and negative validation, including binding cross-checks,
  risk and deployment-admin rejection, and jobs.
- Schema: parity with the runtime validator, and the candidate shape still
  valid.
- Request and result validators:
  - bounds, accessor and prototype rejection;
  - Unicode, timestamp and request binding;
  - warning consistency;
  - error-code forward compatibility;
  - frozen copies.
- Harness: gating, request and result enforcement, cancellation.
- Starter: generated tests, plus the packed-package inventory.
- Full gate: `pnpm quality` on Node 24.18.0.

## Future work

- An uploaded-object source (`fromObject`) through the object-store broker.
- An optional OCR mode and mixed-content PDFs.
- Host-attested capture receipts that a plugin can store and re-verify later.

## Closeout

Implemented locally, uncommitted. `pnpm quality` passed in a Linux Node 24.18.0
container (with LF line endings and `git` installed):

- formatting, lint, package boundaries and type checks;
- 597 SDK tests and 47 CLI tests, with coverage;
- builds and packed-package inventory;
- all 15 generated starters verified as packed outside-workspace consumers,
  including `document-capture` with 13 tests.

On Windows, the SDK suite passes. The create-plugin tests fail on the existing
path-separator assumption (`Unsafe generated path: .github\workflows\...`),
independently of this change.

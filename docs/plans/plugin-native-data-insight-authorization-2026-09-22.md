# Plugin-native Data Insight authorization — 2026-09-22

## Problem and finishing criteria

SDK 0.20 can carry a host-attested Data Insight policy but cannot declaratively materialize plugin-native saved-query references or map a governed Forms action input to an attested reference. SDK 0.21 must add both without exposing host internals or embedding business-plugin vocabulary in Core.

The change is complete when TypeScript contracts, manifest and registration validation, JSON Schema, starter/reference implementation, tests, docs, package versions, release inventory, and clean-consumer verification agree.

## Design

- A dashboard template query chooses exactly one source: existing Forms `dataset_id` plus `semantic_query`, or `plugin_query.saved_query_id` with an optional datasource id. The route-owning plugin is implicit; cross-plugin references are forbidden.
- A read-only Forms action may declare `dataInsightAuthorization: { namespace, inputField }`. Both values are stable bounded identifiers. The host extracts one top-level scalar input and authorizes it against the supplied policy context before plugin execution.
- The host continues to own tenant/group/dashboard mapping, actor revalidation, grants, audit, persistence, execution routing, and denial. The plugin owns stable query/report identifiers and repeats catalog and attestation validation.

## Security and lifecycle

Declarations never grant access. Governed actions are read-only, Forms-placed, and fail closed when the input is missing, non-scalar, or absent from the attested namespace. Plugin-native query templates contain bounded identifiers and no SQL, credentials, or customer data. No durable store or retention behavior is added.

## Verification

- Positive and negative contract, manifest, registration, schema-parity, starter, packaging, and clean-consumer tests.
- Full `pnpm quality` before release.
- Review `docs/training-course.md` and update the relevant module.

## Closeout

- Updated the training course, SDK reference, authorization guide, changelog, and both package versions for 0.21.0.
- `pnpm quality` passes, including 201 SDK tests, 44 CLI tests, coverage thresholds, package inventory, builds, and clean-consumer verification for every generated starter.
- Autoreview found one P2 security gap in the starter: host-attested identifiers were not also checked against the plugin's current catalog. The starter now enforces both boundaries and tests stale attested query and report identifiers; the full quality suite passes after the fix.
- Authorization impact: declarations remain non-authoritative; the host must revalidate policy membership and the plugin must validate both attestation and its current catalog. No role ceiling or ordinary grant is weakened.
- Lifecycle impact: the contract carries bounded identifiers only and adds no customer-data store, cache, export, retention, or deletion behavior.
- Immilytics integration exposed that a complete persona dashboard can require more than 20 queries while the contract already permits 40 widgets. Patch release 0.21.1 aligns the query bound to 40, retains the existing 20-question bound, and adds an exact 40/41 boundary regression test.

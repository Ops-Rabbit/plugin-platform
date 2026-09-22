# Data Insight Authorization Context — 2026-09-22

## Problem

Business Data Insight plugins need a host-attested, invocation-scoped authorization context, while their policy vocabulary and stable report/metric identifiers remain plugin-owned. Passing a host-private object through a widened adapter type is not a public contract and couples plugins to host internals.

## Design

- Add optional template `authorization` metadata containing a stable plugin-owned `policy_key` and bounded namespaced reference arrays. It declares catalog intent and never grants access.
- Add `context.dataInsightAuthorization` schema version 1. The host supplies it only after revalidating tenant, actor, group membership, dashboard policy, and the allowed subset of plugin-declared references.
- Use generic reference namespaces rather than business-specific report, metric, entitlement, or persona fields.
- Export TypeScript types, runtime validation, a JSON Schema, test-harness injection, documentation, and an executable `forms-insights` starter example in SDK/CLI 0.20.0.

## Security and lifecycle

The context contains stable identifiers only, no customer rows, query results, credentials, or legal-profile values. The host owns resource grants, atomic audit, revocation, expiry, deletion, tenant isolation, and role ceilings. Plugins must verify every requested reference against both the attestation and their current catalog. Labels, settings, and conversation bindings are never authorization inputs.

## Verification

- SDK typecheck and tests, including runtime/JSON-schema parity and malformed/over-broad contexts.
- Generated starter and clean-consumer verification.
- Full repository formatting, lint, coverage, build, packaging, and starter quality gates before release.

## Closeout

- `pnpm quality` passes, including 197 SDK tests, 44 CLI tests, package inventory checks, and clean-consumer verification for every generated starter.
- Autoreview found two P2 schema/runtime parity issues: whitespace-only references and unbounded authorization keys. Both exported schemas now match the runtime's non-whitespace reference rule, and authorization policy/namespace keys are capped at 80 characters in both paths. Focused parity tests cover both cases.
- The contract introduces no customer-data store. Authorization, tenant/group validation, audit, revocation, expiry, and deletion remain host responsibilities; plugin declarations remain non-authoritative catalog metadata.

# Changelog

All notable public package changes are documented here. This project follows
semantic versioning for the SDK contract and CLI.

## 0.6.1 - 2026-07-18

- Require a valid Drizzle migration journal whose entries exactly match the
  declared SQL migration files.
- Include the required journal in the generated service-ingress starter and in
  packaged plugin archives.
- Prevent database plugins that would fail OpsRabbit deployment from passing
  CLI validation and release packaging.

## 0.6.0 - 2026-07-18

- Add generic, strictly validated `requiredEntitlements` manifest metadata so a
  plugin declares its own license requirements without plugin-id branches in
  host core.
- Document that the host owns entitlement recognition, license state, UI
  suppression, activation enforcement, and audit.
- Update the generated Forms-workflow reference to require `configured_forms`.
- Add authenticated internal plugin ingress with exact method, scope, and body
  limit declarations.
- Add public schema-confined relational storage and governed object-store broker
  contracts, migration asset validation, and a generated service-plugin starter.
- Add generic Form-record placement for executable plugin actions, a
  module-scoped Forms broker, and explicit Data Insight catalog discovery.
- Add optional plugin-scoped Forms creation idempotency keys for safely
  replaying durable ingress events after partial failures.
- Package only the manifest-declared migration directory, preventing
  unvalidated sibling migration assets from entering release archives.

## 0.5.1 - 2026-07-18

- Republish the complete Forms-workflow contract after npm `0.5.0` was
  published before the workflow validator, JSON Schema, and generated starter
  reached `main`. Consumers using `navigation.workflow` must use `0.5.1` or
  newer.

## 0.5.0 - 2026-07-17

- Add the public generic Forms-workflow navigation contract, setting and starter
  cross-validation, schema support, documentation, and generated reference starter.
- Add repository and generated-plugin `AGENTS.md` rules requiring every future
  public core capability to ship with contracts, schemas, validation, docs,
  starters, and clean-consumer coverage.
- Add a public `release` command that enforces manifest, package, and immutable
  `vX.Y.Z` tag alignment.
- Include a tagged GitHub Release workflow in every generated plugin repository.
- Produce a deterministic plugin ZIP, SHA-256 checksum, SPDX 2.3 SBOM, release
  metadata, and GitHub artifact-provenance attestation from the scaffold.

## 0.4.0 - 2026-07-17

- Add validated declarative Forms starter packs to the public manifest contract,
  packaging flow, generated repositories, and in-memory test harness.

## 0.3.0 - 2026-07-17

- Add public Forms workspace navigation declarations and validation.

## 0.2.0 - 2026-07-16

- Make the JSON manifest authoritative and remove duplicated manifest metadata
  from runtime source definitions.
- Add named, risk-aware declarations for tools, actions, routes, scheduled jobs,
  widgets, settings, and tenant-record collections.
- Align public job, widget, role, actor, cancellation, configuration, and storage
  contracts with the OpsRabbit host adapter.
- Reject traversal entrypoints and undeclared, duplicate, or inconsistent
  registrations before activation.

## 0.1.0 - 2026-07-16

- Introduce the public plugin SDK, manifest schema, validation, compatibility,
  package inventory, and in-memory test harness.
- Introduce the CLI with read-only, operational-action, scheduled-job, and
  managed-tenant-record starter/reference plugins.
- Add deterministic release ZIPs, clean-consumer verification, CI, and guarded
  npm publication from `main` using trusted publishing.

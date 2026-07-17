# Changelog

All notable public package changes are documented here. This project follows
semantic versioning for the SDK contract and CLI.

## 0.5.0 - Unreleased

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

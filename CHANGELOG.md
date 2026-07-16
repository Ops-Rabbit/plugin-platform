# Changelog

All notable public package changes are documented here. This project follows
semantic versioning for the SDK contract and CLI.

## 0.2.0 - Unreleased

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

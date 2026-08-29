# Changelog

## 0.17.0 - 2026-08-29

- Add the closed native-workspace `plugin.actions.invoke` capability and typed
  `context.pluginActions.invoke` broker for current-plugin declared actions.
- Update the native-workspace starter to demonstrate host-governed action
  invocation without plugin or tenant overrides.

## 0.16.1 - 2026-08-28

- Align governed Forms approval provenance with the persisted
  `stage_transition / approval / in_review / approved` workflow tuple.
- Expose raw workflow transition and approved-content provenance fields to
  public plugin Forms consumers.

## 0.16.0 - 2026-08-28

- Add typed, read-only IMAP Connection selectors and invocation-scoped
  `connections.materialize` access.
- Add bounded plugin-owned Knowledge deletion, search, and exact metadata-family
  retrieval contracts.
- Expose immutable Forms approval provenance and content hashes to publication
  actions.
- Add the executable `connection-knowledge-review` adapter-boundary starter,
  revision cleanup, reranking, packaging coverage, clean-consumer verification,
  and host-boundary guidance.

## 0.15.0 - 2026-08-27

- Add host-owned Administration navigation for declarative deployment-admin workspaces.
- Keep menu routes, localization, enablement, and authorization bounded by the host.

## 0.14.0 - 2026-08-26

- Add versioned deployment interaction-policy contracts for transactional chat
  admission, composer status, declarative admin workspaces, identity-directory
  reads, transactional audit, subject lifecycle, and plugin localization.
- Validate manifest and runtime registration parity, admin-only references, and
  packaged localization bundles.
- Add the executable `interaction-policy` starter and clean-consumer coverage.

## 0.11.2 - 2026-08-17

- Add the optional `presentation.show_date_range` dashboard-template contract.

## 0.11.1 - 2026-08-16

- Add `menu` placement for host-rendered plugin Data Insights dashboards.
- Keep menu dashboards separate from application records and reject tab-only
  default/preference fields for menu placement.

## 0.11.0 - 2026-08-16

- Add the versioned, framework-neutral native workspace manifest and browser ABI.
- Validate entry, stylesheet, and asset declarations plus referenced regular files and size limits.
- Add the executable `native-workspace` starter and host-boundary guidance.

## 0.10.0 - 2026-08-12

- Add optional immutable `conversationBindings` and separately verified `embeddedChat` identity to plugin invocation context for deterministic, authorizable Embedded Chat tool calls.
- Bindings remain untrusted input; hosts and plugins continue to enforce tenant and resource authorization independently.

## 0.9.0 - 2026-08-06

- Add a declared, host-managed Knowledge write broker for plugin-owned sources,
  bounded text-document upserts, and explicit index publication.
- Add the executable `knowledge-publisher` starter and test-harness support.

## 0.8.1 - 2026-07-26

- Add declarative read-only Forms fields and plugin-route computed value sources.

All notable public package changes are documented here. This project follows
semantic versioning for the SDK contract and CLI.

## 0.8.0 - 2026-07-26

- Expand the trusted Forms-workspace navigation icon catalog so plugins can
  choose a semantic icon directly, including `receipt` for quotation and
  billing workspaces.
- Keep navigation icons as validated keys rather than accepting arbitrary
  markup or asset paths that the host cannot safely render.

## 0.7.1 - 2026-07-19

- Add the generated `forms-insights` reference with Forms metadata, analytics
  and template catalogs, editable dashboard defaults, and clean-consumer tests.
- Document first-use dashboard materialization, grant-aware layout editing,
  Records-tab drill-through, and generic agent catalog/query tools.
- Preserve the script-compatible `examples list` output and add descriptive
  `examples list --verbose` output.

## 0.7.0 - 2026-07-19

- Add the public Forms Insights workspace manifest contract, dashboard-template
  types, strict manifest validation, JSON Schema support, and host compatibility
  guidance.
- Support metric, table, text, bar, line, area, pie, donut, and scatter template
  widgets through caller-scoped Forms analytics.

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

# Changelog

## 0.12.0 - 2026-08-20

- Add the public `knowledgeEmailProcessor` V1 capability and registration contract for host-invoked IMAP Knowledge processing.
- Add provenance and candidate-result validators that reject invented evidence and unknown candidate IDs.
- Add the executable `knowledge-email-processor` starter and clean-consumer coverage.
- Extend Knowledge email processor V1 context with an optional host-managed structured LLM classifier.

## 0.13.0 - 2026-08-20

- Extend Knowledge email processor V1 context with an optional host-managed structured LLM classifier.

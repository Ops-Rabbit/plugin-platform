# Plugin navigation sections

Scope: public optional navigation.section with primary, operations, control,
platform. Omission is backward compatible. Schema and runtime reject malformed
values; generated forms-workflow starter demonstrates operations. Host grouping
preserves role/capability/resource/tenant enablement checks. Placement does not
confer admin-only access.

Authorization: immutable public manifest metadata, tenant-scoped derived
navigation catalog; no grant root or permission change. Lifecycle: no new store,
database migration, customer content or retention class. Existing package
deletion and tenant access revocation still apply.

Prior art: reviewed applied-ai-consulting/claude-code develop README via GitHub
API (heading only, no substantive design). Fallback local
applied-artificial-intelligence/claude-code-toolkit README favors self-contained
declarations; reject unrelated file-based customer stores. Reviewed openai/codex
codex-rs/protocol/README.md: explicit minimal shared contracts fit; no new protocol
stack needed. Host plan has the coordinated implementation details.

Finishing criteria: schema/runtime positive and negative parity, starter
packaging/clean-consumer, updated SDK README, training course, starter reference,
changelog, versions and published release dependency; host consumes the published
package, then dependent plugin declares Control. Local source is only a test
fixture, not a replacement for publishing. User approved SDK/CLI0.19.0 and dependency pin edits.

The additionally approved adminOnly boolean restricts tenant menu discovery and
workspace descriptor/capability/action/asset access; false/omission preserves
existing behavior. Runtime tools, schedules and ordinary Forms grants are
separate. Schema/runtime parity includes boolean true/false and malformed values.

192 SDK tests pass with fresh coverage: manifest contract 100%, validator 91.1%.
Build passes. Full quality and clean consumers passed before the adminOnly
addition; fresh0.19.0 quality and clean-consumer checks are running.
SDK/CLI manifests and generator constants now target0.19.0. No publication, PR or paid CI performed. Full pinned strict Semgrep completed156files with no parser errors. The user authorized seven pre-existing findings' cleanup as a separate commit: dependency update/install cooldowns, pnpm10.34.0 trust controls and a static bounded release-planner regex preserving distinct nested version metadata. A subsequent full scan returned zero findings and no parser errors; final scan/review are running.

# Incident register public contracts

Implementation branch: codex/incident-register. Coordinated design authority: OpsRabbit host `docs/plans/incident-register-plugin-2026-10-16.md` on the same named branch.

Scope: public Inbound lifecycle delivery, namespaced plugin resource access, authorized multi-tenant query boundaries, standalone workspaces, tenant-model enrichment and shared retention integration. No private host imports, no ordinary incident persistence through Forms. Public contracts are not complete until schema/runtime parity, executable reference, clean packaged consumer, docs/training, version/release inventories and host compatibility are verified.

Initial slice: strict v1 Inbound lifecycle envelope and explicit manifest/handler parity. Canonical tenant/source event identity is host-attested; payload validation alone never authorizes delivery. Approved bounded content only, no raw payloads/credentials. At-least-once delivery requires idempotent transactional receipts, per-change revisions and deletion fences. Runtime cancellation and tenant mismatch prevent handler entry. Host grant and lifecycle enforcement remain outside this contract slice and are not claimed implemented.

Authorization/lifecycle: tenant-local owner/grants remain authoritative, output-sharing policies apply independently of incident-plugin enablement, and read/use/write/manage preserve role ceilings. Correlation ignores sharing differences within a tenant per explicit user decision; inherited grants retain origin/revocation tracking. No durable store is introduced by SDK definitions/validators/reference; host outbox and plugin stores require retention classes, deletion/restore reconciliation, active-work and hold rules from the coordinated plan.

Verification: TypeScript check; schema and runtime positive/negative parity; undeclared/missing handlers; tenant mismatch/cancellation absence of handler effects; packaged schema/reference inventory; meaningful fresh coverage for changed validation files. Tests serialized with 120000ms test/hook deadlines. Dependency/package edits await explicit approval.

Prior art: applied-ai-consulting/claude-code `dfb44640ca1c2b64b882a15edf73ec0374d41d9a` hooks/useTaskListWatcher.ts: claim ownership before execution fits; filesystem polling/process refs do not provide durable tenant delivery. openai/codex `6ae8b8aa7c608730d4315d59c5c081897ae02780` codex-rs/protocol/src/protocol.rs Event/EventMsg: typed correlated events fit; conversation protocol is not authorization or an outbox. Exact links and source review are in the host plan.

Closeout: implementation in progress; SDK release, host and plugin not yet complete.

## Release review progress

User approved SDK/CLI 0.28.0 package changes and downstream SDK/table/chart dependencies. SDK/CLI version constants and schema export updated; frozen-lockfile install succeeds without lockfile changes. Initial full quality passed (SDK 333 tests at that revision, CLI 44 tests, all generated starters, builds and package inventory). Follow-up independent review fixed joined correlation references, full-origin/per-entity revision semantics and added an outside-workspace packed consumer. Refreshed SDK validation and review are required after those fixes.

Two independent reviewers inspected the full SDK slice. Autoreview identified incomplete origin keys in lifecycle guidance; corrected to tenantId/inboundId/sourceEventId with per-change/entity slots. Semgrep identified dynamic RegExp construction; replaced with fixed precompiled patterns without suppressions. Full feature integration is not claimed by this SDK release.

# Tool execution progress

Add optional execution-scoped third `onUpdate` argument, strict plain-text update
contract/schema, starter and packed consumer verification. Existing plugin handlers,
manifest apiVersion, final results and host approval/authorization remain unchanged.
No new manifest capability, store, identity or retention class.

Authorization: host gates tool execution by actor/tenant/grants and original call;
update fields cannot select recipients or grant privileges. Lifecycle: existing
turn/execution output ownership, retention and parent deletion; callback closes on
settlement or cancellation. No separate durable progress history.

Host integration is in `/Users/aaic/work/gaurav-exp`, documented in
`docs/plans/plugin-tool-progress-2026-10-09.md`, including reviewed prior art from
`applied-ai-consulting/claude-code` (`develop:Tool.ts`) and `openai/codex`
(`main:codex-rs/core/src/unified_exec/process_manager.rs`). Adopt separate progress
and completion with abort context; reject application internals and process/job
polling for this additive callback.

SDK/CLI release inventory: 0.24.0, both package manifests, CLI/SDK generated version
constants, public root exports, `./tool-update-schema` export, schema pack inventory,
basic-readonly starter and clean consumer script. Training course gains the callback
example and explicit host compatibility/lifecycle guidance. Publication is required
before host production integration can be considered complete.

## Verification and reviews

- `pnpm quality` passed: formatting, lint, package boundaries, SDK/CLI type checks,
  coverage suites (276 SDK tests, 44 CLI tests), builds, pack inventories, packed
  public progress/schema consumer, and all generated starters outside the workspace.
- Fresh V8 line coverage: tool-update contract 100%, registration 89.7%, CLI
  constants 100%; the generated basic-readonly implementation is 100% covered.
- Exact host-pinned Semgrep 1.179.0 image and strict flags passed for the full SDK
  repository, exit 0 with no findings or warnings. Mounted linked-worktree Git
  metadata read-only so the scanner can honor checked-in ignore rules; no new
  exclusions or weakened settings. An initial scan without that metadata scanned
  ignored generated coverage assets; the corrected scan completed cleanly.
- Independent SDK/consumer/documentation review found no remaining actionable
  issues. A suspected missing consumer gate was disproved by the existing parent
  verifier invocation and its successful execution.
- Repository-required autoreview of the complete proposed changes returned
  `scoped-clean` through P2. Training course and starter reference updated.
- Host integration separately passed 149 deterministic tests, changed-file line
  coverage above 85%, type checks against the development SDK and quality lint.
  This does not establish published-package production compatibility.

SDK 0.24.0 remains unpublished. Ready-for-review SDK PR is the release prerequisite;
host dependency/lockfile update and production verification must follow publication.
No paid CI or npm publication was manually started.

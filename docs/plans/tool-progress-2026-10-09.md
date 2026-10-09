# Tool execution progress

## Minimal scope

Add optional third `onUpdate` argument to `ToolDefinition.run`, using the existing
`PluginToolOutput` contract and existing host result conversion. Existing handlers,
final results and manifest schemas are unchanged. No new payload/schema/validator,
UI, status tool, background job, resource or store. Update the executable
basic-readonly starter and SDK/CLI release inventory to 0.24.0.

Host approval, actor, tenant and resource gates remain mandatory. Callbacks belong
to the original invocation and close before conversion on completion, failure or
cancellation. Existing output protection, authorized stream/replay and parent-event
retention/deletion apply. No duplicate progress history or new grant/audit mutation.

Reviewed prior art: `applied-ai-consulting/claude-code` `develop:Tool.ts` and
`openai/codex` `main:codex-rs/core/src/unified_exec/process_manager.rs`. Adopt separate
progress and completion with abort context; reject application-specific rendering
and process/job polling. Host integration plan contains the authorization matrix
and lifecycle inventory.

SDK and CLI manifests/constants move together to 0.24.0. Training course, starter
reference and contract guide updated. Generated starter verification consumes
packed SDK/CLI outside the workspace. Production host integration requires SDK
publication followed by its dependency and frozen-lockfile update.

## Verification and review

The minimal implementation passed `pnpm quality`: formatting, lint, boundaries,
type checks, 262 SDK tests, 44 CLI tests, coverage, builds, package inventory and
all generated starters as packed outside-workspace consumers. Registration line
coverage is 89.7%; CLI constants and the generated basic-readonly implementation
are 100%. The exact host-pinned Semgrep 1.179.0 image/rules/strict flags passed the
full SDK repository with zero findings or warnings. Independent review and final
autoreview of the complete staged candidate returned no actionable P0–P2 findings.
Training inventory now matches 0.24.0; capability-introduction versions stay intact.

Host source is isolated and release-dependent: its normal installed 0.23.0 cannot
typecheck the new callback contract. Autoreview correctly identified that as a
publication/dependency blocker, so no host PR is ready. SDK publication must precede
the host dependency/lockfile update and normal verification. No paid CI or npm
publication was manually started.

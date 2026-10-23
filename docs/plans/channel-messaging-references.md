# Adapter-only messaging references

Design and scope: optional host-bound reference resolver for Teams destination routing and confirmed sent-message quoting in WhatsApp. Preserve existing send/input/receipt contracts. No new credential access, broad history, model tool, manifest entitlement or durable store. Host implementation is a separate coordinated release dependency; this SDK does not imply runtime availability.

Authorization: bind to current actor, tenant, plugin, inbound, allowed destination and accessible host chat. Destination routing may come only from authenticated inbound activity belonging to that inbound and destination. Sent-message lookup may return only a confirmed send by this provider/inbound/destination in the current accessible chat, never unrelated or incoming message text. Every lookup must revalidate current identity, grants, plugin/inbound enablement and configuration; a reference grants no send authority. Reject malformed requests, bound lookups to four per adapter invocation, and return null for missing/deleted/expired/inaccessible records indistinguishably.

Lifecycle: no reference copy/store. Resolve from existing retained inbound routing metadata or confirmed host tool-call/receipt pairs, and follow their parent deletion, retention, holds and restore reconciliation. Audit reads without bodies, credentials or full references. No plugin SQL or filesystem cache. Provider routing endpoint trust and live permission fencing remain host/adapter responsibilities. External messages and backups remain under existing owners.

Public delivery: contracts/exports, request/result schemas and validators, executable reference, test harness, positive/negative/schema-parity/binding tests, packed clean-consumer verification, documentation/training/release inventory. Release 0.34.0 alongside matching CLI. User explicitly approved SDK and dependency changes; host consumes published package only after release. Host design is `docs/plans/teams-whatsapp-agent-messaging-2026-10-23.md` in applied-ai-consulting/gaurav-exp.

Prior art reviewed for the coordinated design: openai/codex d6817454d76885e9d0e118bbf82e507aed6f715a, codex-rs/core/src/tools/approvals.rs (explicit host-owned identity/approval, reject sandbox redesign); applied-ai-consulting/claude-code dfb44640ca1c2b64b882a15edf73ec0374d41d9a, utils/permissions/PermissionMode.ts (central policy, reject blanket bypass). New API keeps that separation: retrieving routing data is never authorization.

Verification: sequential SDK tests/coverage and complete pnpm quality including every clean generated consumer. Independent reviews and autoreview before PR. No live provider messages, auth changes, host code or migrations in this PR.

## Verification closeout

- Full `pnpm quality` passes: formatting, lint, type checks, SDK/CLI coverage (660 SDK tests and 47 CLI tests), build, packed package inventory and every generated starter outside the workspace.
- Final focused check after fixed-pattern cleanup: type check/build/lint and 69 messaging tests pass. Fresh V8 coverage is 100% lines/branches for the reference validator and harness; both touched messaging contracts' runtime constants also have 100% coverage (interfaces are erased).
- Full repository Semgrep with the OpsRabbit pinned 1.179.0 image/digest and auto/error/strict/jobs 2/timeout 60 settings exits 0 with zero findings/errors. Replaced dynamic pattern compilation flagged in the initial scan with fixed module-level patterns; no suppression or rule change.
- Two independent reviews completed; removed a resolver from configuration discovery and a duplicate changelog insertion. Final independent re-reviews are clean. Autoreview is rerun on the frozen final candidate because source changed during its first snapshot.
- No live provider, host database, auth or paid CI operations. This PR is a contract release prerequisite, not a completed Teams/WhatsApp host implementation.

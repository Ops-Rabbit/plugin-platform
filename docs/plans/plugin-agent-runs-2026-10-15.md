# Plugin agent runs v1

## Scope

Add the optional `agentRuns` capability to the public SDK 0.31.0: manifest
permission bindings, typed start/get/cancel brokers, host-attested completion
handlers, and the capability-gated `agent.runs.observe` browser service. Any
plugin may declare it; nothing is specific to one plugin or domain.

Non-goals: document or URL capture, upload content reads, plugin-declared tools,
skills or limits, start idempotency keys, and completion-handler storage
brokers. Each needs its own reviewed contract.

## Design

- A binding names required agent settings, three distinct bound actions with
  fixed risks and operator role, a completion handler and optional presets. It
  declares no tools, skills, size, deadline or capacity limits: the host decides
  what a run may use, matching how the host bounds chat turns.
- A request supplies exactly one of `instructions` or `presetId`, JSON `inputs`
  and an optional bounded output schema. Validators enforce shape, structural
  JSON bounds and binding scope; the host passes its own byte bound.
- Results keep the host-attested accepted request and its digest separate from
  untrusted output. `canonicalPluginAgentRunJson` is the shared digest input.
- Observed snapshots omit the request, so observation frames stay small however
  large an accepted request is. State validation enforces status, error,
  delivery and timestamp invariants and a 1 MiB transport ceiling.
- Completion delivery is at most once; the canonical result stays readable
  through the bound get action.

## Compatibility

Additive only. Manifests, registrations and native workspaces that do not
declare the capability validate exactly as before. Schema changes add
`agentRuns`, `agentRunBinding`, `agentRunId`, `frontend.agentRunBindingIds`, the
`agent.runs.observe` enum value, two conditional rules, and raise the frontend
capability `maxItems` from 7 to 8. No existing export, field, enum or
requirement changes.

## Authorization and data lifecycle

Declarations request access only. The host checks actor, tenant role, plugin
enablement, the admin-set agent setting and the agent use grant at start; rechecks live authority during execution and before
delivery; and scopes get, cancel and observation to tenant, plugin and initiating
user. Run ids are opaque, never bearer tokens. The host owns persistence,
retention, deletion, audit and logging limits for run content; see
`docs/plugin-agent-runs-v1.md`.

## Future work

- Approving tools that need human approval in plugin runs, instead of refusing
  them, for example through a visible run thread or a notification.
- Finer host options for what plugin runs receive (memory, Knowledge retrieval,
  Connection and infrastructure context, dynamic tool loading, Knowledge
  citation hold) instead of one tools on/off choice.

## Rollout

Release SDK and CLI 0.31.0 together, then pin the published version in a host
that implements the contract. Plugins must check `context.agentRuns` before use.

## Verification

`pnpm quality` passed in a Linux Node 24.18.0 container: formatting, lint,
package boundaries, type checks, 312 SDK tests, 45 CLI tests, coverage, builds,
packed inventory, and all 14 generated starters as packed outside-workspace
consumers. The `agent-run` starter runs 6 tests at 100% line coverage. On
Windows, create-plugin's existing path and `npm` spawn assumptions fail its
tests independently of this change.

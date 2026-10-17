# Plugin agent runs v1

Introduced in SDK 0.31.0. A plugin can ask a compatible host to run one of the
tenant's own agents on plugin-supplied instructions and JSON inputs, follow the
run, cancel it, and receive its result. The manifest declaration requests access;
it grants nothing. Runtime availability requires a host that implements this
contract, and callers must check that `context.agentRuns` is present.

## Declaration

`capabilities.agentRuns` is `{ schemaVersion: "1", bindings: [...] }` with 1 to
16 bindings. A binding is a permission envelope, not a fixed task:

| Field                                            | Meaning                                                                                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                             | Stable binding id, also returned as `bindingId` on every run.                                                                                                                                      |
| `agentSettingKeys`                               | 1 to 8 required `string` plugin settings without a `default`. Each holds the name of a tenant-owned agent that an admin chooses; the manifest cannot choose it.                                    |
| `startActionId`, `getActionId`, `cancelActionId` | Distinct declared tenant actions with `external`, `read` and `write` risk respectively, each requiring `operator` or `admin` role and not `deploymentAdminOnly`. An action may be bound only once. |
| `completionHandlerId`                            | Id of the handler registered under `agentRunCompletions`.                                                                                                                                          |
| `presets`                                        | Optional, at most 16 reviewed instructions of up to 12,288 characters that a run may select by id.                                                                                                 |

A binding declares no size, deadline or capacity limits, and no tools or
skills. Those are host policy (see [Host responsibilities](#host-responsibilities)).

A native workspace that follows runs adds `agent.runs.observe` to
`frontend.capabilities`, lists 1 to 16 declared binding ids in
`frontend.agentRunBindingIds`, and allowlists each binding's get action in
`frontend.actionIds` with `plugin.actions.invoke`.

`validateManifest` checks every reference and reports each invalid field at its
own path. The published JSON Schema validates the same shape; settings and
action cross-references are runtime checks.

## Runtime

An action bound by a binding receives `context.agentRuns`; other invocations do
not. The broker exposes only the operation its action is bound for.

- `start(request)` takes a `PluginAgentRunRequestV1`:
  `{ schemaVersion: "1", bindingId, agentSettingKey, inputs, outputSchema? }`
  plus exactly one of `instructions` or `presetId`. It returns `{ runId }` after
  the host durably accepts the run. `start` is not idempotent; do not retry it
  automatically after an ambiguous failure.
- `get({ runId })` returns a `PluginAgentRunSnapshotV1`.
- `cancel({ runId })` requests cancellation and returns the snapshot. A run that
  already settled is returned unchanged.

A snapshot contains `runId`, `bindingId`, `status`, `progressCode`,
`deliveryStatus`, `result`, `errorCode`, `createdAt`, `startedAt` and `endedAt`.
`parsePluginAgentRunStateV1` enforces these invariants:

| Status           | Required fields                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `queued`         | progress `queued`; not started; no error                                                                                               |
| `running`        | progress `running` or `preparing_result`; started; no error                                                                            |
| `succeeded`      | progress `delivering_result`; ended; result and delivery status present; `errorCode` is `DELIVERY_FAILED` exactly when delivery failed |
| `failed`         | ended; `EXECUTION_FAILED`, `RESULT_INVALID` or `DEADLINE_EXCEEDED`                                                                     |
| `cancelled`      | ended; no error                                                                                                                        |
| `access_revoked` | ended; `ACCESS_REVOKED`                                                                                                                |

Timestamps are normalized UTC ISO strings with milliseconds and never go
backwards. Progress codes are state hints, never percentages.

A succeeded result is
`{ kind: "execution_v1", request, requestDigest, output }`. `request` is the
accepted request (`PluginAgentRunAcceptedRequestV1`): `instructions` is always
resolved, and when a preset was selected `presetId` is kept as provenance, so
the accepted request is not itself a start request. Absent optional fields are
omitted. `requestDigest` is the lowercase hex SHA-256 of
`canonicalPluginAgentRunJson(request)` in UTF-8, so a plugin can confirm which
request produced the output. Like `JSON.stringify`, the canonical form omits
object keys whose value is `undefined`. `output` is untrusted agent output:
validate it before use, for example with `matchesPluginAgentRunOutputSchema`
and the run's `outputSchema`.

`parsePluginAgentRunRequestV1(value, binding, { maxRequestBytes })` validates a
request against its binding and returns the accepted request. It rejects unknown
fields, a binding or agent setting outside the binding, ambiguous or blank
instructions, caller instructions over 12,288 characters, non-JSON values, own
`__proto__` keys, and output schemas outside the supported subset. `constructor`
and `prototype` are ordinary data keys. Structural bounds
(`PLUGIN_AGENT_RUN_JSON_BOUNDS`) limit depth, array length and object width.
Observed agent output is checked for JSON shape, depth and `__proto__` keys
only. Its size is bounded by the host and by the state transport ceiling, not
by array length or object width.
Run JSON must be a tree, as `JSON.parse` produces: an object or array that
appears more than once, whether shared or cyclic, is rejected. The host
supplies the byte bound, which applies to the accepted request after preset
instructions are resolved.

The output schema subset supports `object`, `array`, `string`, `number`,
`integer`, `boolean` and `null` types with `properties`, `required`,
`additionalProperties`, `items`, `enum` and size or number bounds. References,
patterns, formats and composition keywords are rejected.

## Completion delivery

When a run succeeds, the host calls the declared completion handler with a
host-attested `{ runId, tenantId, initiatingActorId, bindingId, result }` and a
context carrying `tenantId` and `signal`. Only the host can invoke a handler; no
browser action reaches it.

Delivery is tracked as `pending`, `delivering`, `delivered` or
`delivery_failed`, and is at most once. A handler error or a worker failure
during delivery ends in `delivery_failed` and is not replayed. The completion is
a notification: the canonical result stays readable through the bound get
action, so plugins should treat handlers as idempotent by `runId` and fall back
to `get`.

## Frontend observation

`context.agentRuns.observe({ runId }, observer)` returns a `close()` handle
synchronously. The observer receives:

- `connection` events: `connecting`, `live` or `reconnecting`;
- `state` events carrying `{ schemaVersion: "1", revision, snapshot }`;
- `closed` events: `settled`, `access_ended` or `unavailable`.

A `closed` event or an `onError` call ends the observation. A throwing callback
closes only that observation. Closing, unmounting or aborting never cancels the
run.

Observed snapshots never contain the run request: an observed result is
`{ kind: "execution_v1", requestDigest, output }`. Read the request through the
bound get action when it is needed. `revision` is a positive decimal BIGINT
string; accept increasing revisions within a connection, and treat each initial
or reconnect snapshot as canonical. One observed state is at most
`PLUGIN_AGENT_RUN_STATE_MAX_BYTES` (1 MiB) of UTF-8 JSON. A succeeded run is
settled only when delivery is `delivered` or `delivery_failed`
(`isPluginAgentRunSettled`).

When access ends, clear any protected content shown for the run.

## Host responsibilities

A compatible host:

- validates the manifest and runtime registration, and rejects activation if it
  cannot provide a declared capability rather than omitting the broker;
- exposes the broker only to bound actions and only for the bound operation;
- at start, checks the signed-in actor, tenant membership and role, plugin
  enablement, the admin-set agent setting, the actor's use grant on that
  tenant-owned agent; then persists a tenant-scoped run before returning its
  id;
- owns request size, output size, deadline, per-user and per-tenant capacity,
  queueing, cancellation, retention, deletion and audit. Plugins cannot declare
  or raise these limits;
- decides what a run may use. Plugins never declare tools or skills. By
  default the run is isolated, with no tools, skills, memory, Knowledge,
  Connections or unrelated history. A host may let an administrator allow the
  agent's own configured tools and skills for a plugin's runs; the run then uses
  them with the initiating user's authorization. Tools that need human
  approval are refused rather than left waiting, and tools that would start,
  message or schedule other sessions are withheld so the run's work stays
  inside it. Plugin instructions and inputs
  always stay below the host's system instructions, and inputs stay marked as
  untrusted data;
- rechecks live authority while the run executes and before delivery; loss of
  access promptly ends the run as `access_revoked` and stops its execution;
- scopes `get`, `cancel` and observation to the tenant, plugin and initiating
  user; a run id is an opaque identifier, never a bearer token;
- keeps run content out of logs and unrelated indexes.

## Testing

`createAuthorizedTestContext(manifest, invocation, { agentRuns })` exposes a
broker only to bound actions, rejects other operations, and validates `start`
requests against the binding. `get` and `cancel` reject any returned snapshot
whose `bindingId` is not the binding that owns the invoking action. A real host
refuses such a run before acting, but the harness can check only after the
supplied broker has returned. `createTestAgentRunObservationService()` from
`@opsrabbit/plugin-sdk/testing` provides deterministic `emit` and `fail` with
the host's close semantics. The generated `agent-run` starter is an executable
reference for the actions, the completion handler and an observation adapter.

## Future work

These are not part of contract version 1:

- a way to approve tools that need human approval in plugin runs, instead of
  refusing them, for example through a visible run thread or a notification;
- finer host options for what plugin runs receive (memory, Knowledge
  retrieval, Connection and infrastructure context, dynamic tool loading,
  Knowledge citation hold) instead of one tools on/off choice.

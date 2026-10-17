# Inbound lifecycle v1 (proposed SDK release)

Declare `capabilities.inboundLifecycle: { "schemaVersion": "1" }` and register
`inboundLifecycle: { schemaVersion: "1", async handle(event, context) {} }`.
Declaration/registration mismatch fails validation. The handler is a tenant-bound
subscriber to existing host intake, not an alternative Agent dispatch engine.
See `packages/plugin-sdk/reference/inbound-lifecycle.mjs` for executable boundary usage.

The host authenticates origin, validates the enabled per-Inbound binding and
plugin availability, checks content persistence policy, and attests the envelope.
It must reject mismatched tenant context before calling the handler. Consumers
must never treat schema-valid tenant IDs as authorization. Existing Inbound
administration remains tenant-admin-only; generated sharing uses current host
read/use/write/manage grants with inherited origin tracking. No raw payload or
secret field is part of this envelope.

Events carry a stable eventId, tenantId, inboundId, sourceEventId, sourceSystemId (trusted source account scope), bindingRevision and positive safe
integer revision, canonical UTC occurredAt and one typed change. Received changes
contain only approved bounded title/description, optional upstream identity and
source severity. The upstream identity may contain source-specific punctuation.
No upstream ID means a local incident identity, not guessed update matching.
A joined correlation change requires threadId, including when joining an already completed investigation. Correlation references are separate; status updates do not authorize thread reads.

Delivery is at least once. Consumer mutation and a deduplication receipt must
commit atomically before resolving the handler. Retries preserve eventId.
Events can arrive out of order. All revision, receipt and deletion keys include
`(tenantId, inboundId, sourceEventId)`; sourceEventId alone is never sufficient.
Within that full origin, received/correlation revisions are separate slots keyed
by change.type, investigation revisions add `(change.type, threadId, turnId)`, and
writeback revisions add `(change.type, operationId)`. This prevents one operation
from suppressing another and keeps a newer writeback from discarding an older
received title. A deletion fence covers all changes of its full origin only; it
must not affect another tenant or Inbound with the same sourceEventId.
Cleanup and receipt expiry must respect the replay window,
and incident identity shared across source events needs corresponding lifecycle
fences; a receipt TTL alone is not a deletion policy.

Correlated incidents can share a thread within one tenant regardless of sharing
policy differences; the host propagates configured output grants, potentially
exposing earlier thread content. This product behavior does not permit crossing
tenants, bypassing role ceilings or using restricted credentials.

The host must durably capture eligible lifecycle transitions, expose delivery
backlog/failure, support bounded replay and preserve investigation/writeback when
the subscriber fails. Exactly-once delivery and lossless capture during a durable
store outage are not claimed. Registration begins with new events after enablement;
recovery replay is distinct from historical import. Disabled/deleted bindings,
active work, holds, source deletion, restore and tenant deletion must be reconciled
before delivery. Do-not-persist must precede durable payload capture.

This release slice defines envelope and handler validation only. Host outbox,
public resource/query authority, workspace/enrichment/retention integration and
the incident plugin remain separate coordinated implementation requirements.

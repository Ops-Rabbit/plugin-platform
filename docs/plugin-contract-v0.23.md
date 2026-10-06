# Channel approval delivery contract v1

Available in the SDK 0.23.0 release. Additive capability: supporting hosts
provide `ChannelApprovalContextV1.approvals` only to registered trusted channel
adapters. The capability is instance/tenant scoped by the host and never accepts
a caller-selected tenant or unrestricted approval id.

The provider adapter authenticates its installation before `bindInstallation`.
It verifies the interaction transport, active human actor and current conversation
access before `resolve`. A display name is supplementary evidence: provider,
workspace and stable user id identify the person. Channel members may approve
once or reject without owning an OpsRabbit account. There is no saved-rule,
always-allow or global policy operation in this contract.

The host owns current inbound enablement, instance and installation binding,
thread/turn provenance, service-principal lifecycle and resource authority.
Approval never elevates the runtime actor. It conditionally claims pending,
unexpired state and records external actor attribution and audit in the same
transaction before execution resumes. Ordinary web resolver permissions remain
unchanged. A concurrent decision returns `applied: false` and canonical state.

`claimDeliveries` returns bounded, leased work with sanitized review content.
Adapters update only bot-authored original messages and post decision receipts
in the original conversation. `completeDelivery` records the exact presented
state; stale completions cannot hide later canonical changes. `failDelivery`
records only categorized diagnostics. An uncertain remote POST must be recovered
by provider readback/correlation before reposting; transport retries cannot
promise exactly-once remote messages. Host startup and shared scheduler invoke
`deliverApprovals` to reconcile missed events, web decisions, expiry and disabled
inbounds. Provider errors do not reverse durable decisions.

Delivery records inherit their approval/thread parent lifecycle. External identity
audit belongs to protected host audit retention. Plugins must not duplicate full
arguments or profile data in their own stores. Parent deletion invalidates all
resolution authority and atomically stages a host-owned cleanup tombstone before
removing the delivery. It contains only installation/conversation/message locators,
correlation id and uncertainty, not deleted review content. Tombstones survive
parent deletion under the host's classified, bounded cleanup lifecycle. Do not
cascade pending cleanup with its deleted parent or protected identity audit.

`claimCleanups` is separate from `claimDeliveries`: deletion must never render or
post a replacement card. The host fences delivery against cleanup and accounts for
in-flight/unknown provider writes before final acknowledgement. The adapter recovers
possible unacknowledged posts by correlation, verifies installation/author, and
removes both the card and receipt. Only then may `completeCleanup` report `deleted`
or definitive `already_absent`. Missing permissions, inaccessible conversations,
failed/partial readback and provider errors are failures, not proof of absence.
`failCleanup` retains the work and diagnostics for bounded retry or visible terminal
failure; it must never re-enable delivery or erase uncertainty. Expiry/cancellation
normally update the existing card, whereas parent deletion claims cleanup work.
External exports and provider backups are outside the local deletion guarantee.

The TypeScript contract and runtime decision validator are exported at package
root. `CHANNEL_APPROVAL_DECISION_SCHEMA` is the equivalent draft-2020-12 JSON
Schema for packaging and consumer validation. Unknown privilege-bearing fields,
missing actor identity and unsupported decisions fail closed. The host must
validate input before querying an approval, then authorize the matching delivery.
`CHANNEL_APPROVAL_CLEANUP_SCHEMA` and `validateChannelApprovalCleanup` validate
minimal cleanup work and reject embedded review content or caller-selected scope.
Both JSON artifacts have public package export subpaths.

See the executable reference `reference/channel-approvals.mjs` for independent
actor attribution, canonical-result rendering and removal without reposting. Its
host/provider stubs illustrate consumer behavior; they do not establish real host
authorization, lease fencing, concurrent state transitions or atomic audit. Those
require integration tests in each supporting host. Hosts without this capability cannot
silently resolve as a system user; adapters must report unavailable support.

# Channel messaging v1

Introduced in SDK 0.26.0. Host implementation is coordinated separately; callers
must check capability presence and version before invoking it.

`ChannelMessagingContextV1` supplies optional `messaging` only to an authorized,
active tool invocation. Its `schemaVersion` is `1`. The plugin declares ordinary
read and external-risk tools in its manifest; this contract does not grant a
plugin arbitrary access to inbounds or secrets.

`listDestinations()` returns only inbound/channel destinations permitted for the
host-bound tenant, actor and actual runtime agent, including the current provider
channel name so callers can resolve a human-requested destination. `sendMessage({ instanceId,
channelId, text, threadId? })` starts a new message when `threadId` is omitted.
SDK 0.27.0 adds replies: require `messaging.supportsThreadReplies === true` and
pass the root id returned as `receipt.threadId` (or the first message id), with the
same instance and channel. A receipt contains its message id and may include the
root `threadId`; subsequent replies must keep using that root, not the latest
reply id. Older brokers without the capability flag still support new messages;
reject follow-ups before any external effect. Never silently create a new message
when a requested reply is unsupported. Inputs are validated with `CHANNEL_MESSAGING_INPUT_SCHEMA` and
`validateChannelMessagingInput`; text contains 1–4000 Unicode characters and at
least one non-whitespace character. Credentials, tenant overrides, acting agent
overrides, host conversation identifiers and arbitrary provider methods are forbidden.
The optional provider thread id has the same bounded opaque-id validation as
destinations. It is routing data, never authority to bypass destination checks.

The host owns role ceilings, active actor/service-principal validation, thread
write and agent use checks, current tenant/plugin/inbound enablement, destination
and agent allowlists, approval binding, configuration fencing, audit, cancellation
and retention. List visibility is subject to the same authority as send. Missing
actors, viewers, empty allowlists and inactive invocations fail closed. The host
must recheck current authority at execution rather than trusting discovery output.

`ChannelMessagingAdapterV1<Context>` is the provider-facing adapter for an existing
saved channel. Its context is the host's already-authorized channel context, never
model input. `listMessagingChannels` returns one bounded page of available
destinations for an admin configuration flow. `sendMessage` posts only after host
authorization and uses existing credentials; no second authentication or copied
secret configuration is required. Provider-specific membership and destination
checks remain mandatory even when the host allowlist permits the destination.
Adapters declare `supportsThreadReplies: true` only when they implement thread
routing and return a verified root id. Otherwise the host must reject replies.
Follow-ups use the same live channel/agent permissions, risk/approval policy,
audit, configuration fences and saved authentication. No extra content store or
automatic inbound conversation/agent reassignment is implied.

No implicit resend is permitted after an ambiguous provider outcome. A provider
success without a usable receipt is uncertain, not confirmed delivery. Hosts must
not promise exactly-once posting based solely on a network acknowledgement.

The broker creates no separate content store. Message input/output follow the
host thread policy; audit excludes tokens and unnecessary message text. Parent
inbound deletion revokes future access and removes owned settings/secrets. Messages
already posted are external provider copies governed by that provider's retention
and deletion behavior.

`packages/plugin-sdk/reference/channel-messaging.mjs` is the executable reference.
It checks capability presence and version before invoking the host-bound broker.
The SDK tests validate request/schema parity and reference behavior. Release work
must add package exports/inventory, a version/changelog, clean-consumer validation
and host compatibility evidence before publication and host consumption.

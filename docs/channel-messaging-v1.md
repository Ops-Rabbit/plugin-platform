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

## Adapter reference lookup (SDK 0.34.0)

Providers opt in with `ChannelMessagingAdapterV1<Context, Context & ChannelMessagingReferencesContextV1>` to receive an optional
`ChannelMessagingReferencesContextV1.messagingReferences`. This is an adapter-only
service, **not** `PluginContext.messaging` and not available to model tools,
configuration routes, arbitrary actions or jobs. Check `schemaVersion === "1"`.
The existing send input and receipt contracts remain unchanged. The second generic parameter defaults to `Context`, preserving older generic dispatchers and non-object contexts such as `void`; listing retains the original context.

`resolve({kind: "destination", channelId})` returns a Teams routing record
containing only `provider`, `serviceUrl`, `conversationId`, `providerTenantId`,
`teamId`, and `botId`. The host resolves it from retained, authenticated inbound
activity for the selected destination. Do not trust a route supplied by the model,
configuration text or unauthenticated webhook. The provider tenant id is not an
OpsRabbit tenant override. Hosts and adapters must enforce the provider's trusted
endpoint policy, including network safety, before using `serviceUrl`; the SDK's
HTTPS URL-shape validation alone does not establish endpoint trust. A configured
channel link alone is not a trusted routing reference.

`resolve({kind: "sent_message", channelId, messageId})` returns only that confirmed
outgoing message's canonical `channelId`, `messageId` and original `text`. This
allows a WhatsApp adapter to construct a quoted reply with its existing linked
session. It must match a confirmed host-owned tool request/receipt pair for the
same plugin, inbound and destination in the current accessible host chat. No
incoming text, other chats, provider message listing or full tool history is
returned. WhatsApp quoting is a reply inside a chat, not a Slack-style thread.
The host verifies the message came from the sending account; an identifier alone
is not proof of authorship.

Unknown, inaccessible, deleted, expired or unconfirmed references return `null`
without revealing which case applied. Missing service or reference must fail an
explicit reply before posting; never downgrade it to a new message. Omit
`threadId` to create a new message, independently of any previous lookup.
Identifiers retain the existing opaque 160-character validation: adapters may use
a documented reversible canonical encoding for native ids containing `@`, but
must verify canonical round trips and exact destination matching. Do not use
lossy replacements or weaken global validation.

The host binds the resolver to the current actor, tenant, declaring plugin,
inbound, destination and host chat. Every call rechecks live permissions, role
ceilings, runtime identity, enabled state, destination and agent allowlists and
revocation. The resolver is only available during its adapter invocation; retained
service handles reject after it ends. Allow at most
`CHANNEL_MESSAGING_REFERENCES_MAX_CALLS` (four) calls per invocation; further calls
reject, including calls made with malformed arguments. Malformed requests reject; host errors reject rather than masquerading as
missing data. Do not return partial or mismatched results. Validate request/result
schemas and bind each result to its exact request with
`validateChannelMessagingReferenceResult(result, request)`.

No new entitlement is granted by this optional service. Older adapters remain
compatible and older hosts omit it; new adapters must detect absence. Host runtime
support and a coordinated OpsRabbit release are required before plugins can use
this API. There is no new manifest capability or minimum-version claim implied by
installing the SDK alone.

Resolve existing retained data on demand; do not create a new SQL/file store or
unbounded message cache. References follow source thread/inbound deletion,
retention, holds and restore reconciliation. Revocation prevents future lookup and
send even when source rows remain. Audit successful reads with identifiers only,
not message bodies, credentials or full routing records. Local deletion does not
delete provider messages, backups or customer exports.

The executable `packages/plugin-sdk/reference/channel-messaging-references.mjs`
checks availability, snapshots and freezes the validated original request before awaiting the broker, and binds the returned result to that original snapshot. Returned references (including nested Teams routing) are detached and frozen so later broker mutations cannot change validated data.
`createChannelMessagingReferencesHarness` in `@opsrabbit/plugin-sdk/testing`
simulates a bounded already-authorized host fixture; it does not prove production
resource authorization. The packed consumer verifies the exports, both schemas,
reference and harness outside this workspace. A strict TypeScript consumer additionally checks the packed service types, result narrowing, inferred adapter context and older adapter/host compatibility; a negative fixture must reject a sent-message request without messageId. No provider network calls are made.

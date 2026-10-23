/** Adapter-only lookup; never expose this service to model tools or configuration routes. */
export const CHANNEL_MESSAGING_REFERENCES_VERSION = "1" as const;
/** A host must reject further lookups after this bound in one adapter invocation. */
export const CHANNEL_MESSAGING_REFERENCES_MAX_CALLS = 4;

export type ChannelMessagingReferenceRequestV1 =
  | { readonly kind: "destination"; readonly channelId: string }
  | {
      readonly kind: "sent_message";
      readonly channelId: string;
      readonly messageId: string;
    };

/** Trusted routing facts from an authenticated inbound, never model-selected network targets. */
export interface ChannelMessagingTeamsRoutingV1 {
  readonly provider: "teams";
  readonly serviceUrl: string;
  readonly conversationId: string;
  readonly providerTenantId: string;
  readonly teamId: string;
  readonly botId: string;
}

export type ChannelMessagingReferenceV1 =
  | {
      readonly kind: "destination";
      readonly channelId: string;
      readonly routing: ChannelMessagingTeamsRoutingV1;
    }
  | {
      readonly kind: "sent_message";
      readonly channelId: string;
      readonly messageId: string;
      readonly text: string;
    };

/**
 * Bound by the host to the live actor, tenant, plugin, inbound, allowed destination and
 * current host chat. No history enumeration. Missing/deleted/inaccessible records return null.
 * Lookup never grants permission to send, and must be reauthorized on every call.
 */
export interface ChannelMessagingReferencesServiceV1 {
  readonly schemaVersion: typeof CHANNEL_MESSAGING_REFERENCES_VERSION;
  resolve(
    input: ChannelMessagingReferenceRequestV1,
  ): Promise<ChannelMessagingReferenceV1 | null>;
}

/** Supplied only to an authorized ChannelMessagingAdapterV1 call; optional on older hosts. */
export interface ChannelMessagingReferencesContextV1 {
  readonly messagingReferences?: ChannelMessagingReferencesServiceV1;
}

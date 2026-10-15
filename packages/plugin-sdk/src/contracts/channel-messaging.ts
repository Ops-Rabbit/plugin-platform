/** Credentials never cross the model/tool boundary. Host binds actor, tenant and agent. */
export const CHANNEL_MESSAGING_VERSION = "1" as const;

export interface ChannelMessagingDestinationV1 {
  readonly instanceId: string;
  readonly instanceName: string;
  readonly channelId: string;
}

export interface ChannelMessagingInputV1 {
  readonly instanceId: string;
  readonly channelId: string;
  readonly text: string;
}

export interface ChannelMessagingReceiptV1 {
  readonly channelId: string;
  readonly messageId: string;
}

/** Invocation-scoped; a reference cannot authorize a later invocation. */
export interface ChannelMessagingServiceV1 {
  readonly schemaVersion: typeof CHANNEL_MESSAGING_VERSION;
  /** Lists only destinations allowed for the current runtime actor and agent. */
  listDestinations(): Promise<readonly ChannelMessagingDestinationV1[]>;
  /** Rechecks live authority and serializes against inbound configuration changes. */
  sendMessage(
    input: ChannelMessagingInputV1,
  ): Promise<ChannelMessagingReceiptV1>;
}

export interface ChannelMessagingContextV1 {
  readonly messaging?: ChannelMessagingServiceV1;
}

export interface ChannelMessagingChannelV1 {
  readonly id: string;
  readonly name: string;
  readonly private: boolean;
}

/** Host supplies the existing channel context only after authorization. */
export interface ChannelMessagingAdapterV1<Context> {
  /** Admin-only configuration discovery; pagination is explicit and bounded. */
  listMessagingChannels(
    context: Context,
    cursor?: string,
  ): Promise<{
    channels: readonly ChannelMessagingChannelV1[];
    nextCursor: string | null;
  }>;
  /** New top-level message. No implicit retries after an ambiguous provider result. */
  sendMessage(
    context: Context,
    input: Omit<ChannelMessagingInputV1, "instanceId">,
  ): Promise<ChannelMessagingReceiptV1>;
}

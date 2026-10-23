/** Credentials never cross the model/tool boundary. Host binds actor, tenant and agent. */
export const CHANNEL_MESSAGING_VERSION = "1" as const;

export interface ChannelMessagingDestinationV1 {
  readonly instanceId: string;
  readonly instanceName: string;
  readonly channelId: string;
  /** Current provider name, for resolving a user's requested destination. */
  readonly channelName: string;
}

export interface ChannelMessagingInputV1 {
  readonly instanceId: string;
  readonly channelId: string;
  readonly text: string;
  /** Parent/root provider message id, scoped to the selected destination. Omit for a new message. */
  readonly threadId?: string;
}

export interface ChannelMessagingReceiptV1 {
  readonly channelId: string;
  readonly messageId: string;
  /** Root id to reuse for further replies; may differ from this messageId. */
  readonly threadId?: string;
}

/** Invocation-scoped; a reference cannot authorize a later invocation. */
export interface ChannelMessagingServiceV1 {
  readonly schemaVersion: typeof CHANNEL_MESSAGING_VERSION;
  readonly supportsThreadReplies?: boolean;
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
export interface ChannelMessagingAdapterV1<
  Context,
  SendContext extends Context = Context,
> {
  readonly supportsThreadReplies?: boolean;
  /** Admin-only configuration discovery; pagination is explicit and bounded. */
  listMessagingChannels(
    context: Context,
    cursor?: string,
  ): Promise<{
    channels: readonly ChannelMessagingChannelV1[];
    nextCursor: string | null;
  }>;
  /** New message or explicit thread reply. Never downgrade a reply to a new message or retry ambiguity. */
  sendMessage(
    context: SendContext,
    input: Omit<ChannelMessagingInputV1, "instanceId">,
  ): Promise<ChannelMessagingReceiptV1>;
}

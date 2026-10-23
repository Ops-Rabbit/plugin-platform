import type {
  ChannelMessagingAdapterV1,
  ChannelMessagingReferenceRequestV1,
  ChannelMessagingReferencesContextV1,
  ChannelMessagingReferencesServiceV1,
  ChannelMessagingReferenceV1,
} from "@opsrabbit/plugin-sdk";
import { createChannelMessagingReferencesHarness } from "@opsrabbit/plugin-sdk/testing";

const requests: readonly ChannelMessagingReferenceRequestV1[] = [
  { kind: "destination", channelId: "teams:channel" },
  { kind: "sent_message", channelId: "wa:chat", messageId: "ABC123" },
];
const fixture: ChannelMessagingReferenceV1 = {
  kind: "sent_message",
  channelId: "wa:chat",
  messageId: "ABC123",
  text: "Original message",
};
const references: ChannelMessagingReferencesServiceV1 =
  createChannelMessagingReferencesHarness([fixture]);
type ExistingContext = { name: string };
// An existing adapter may continue accepting only its original context.
const legacyAdapter: ChannelMessagingAdapterV1<ExistingContext> = {
  async listMessagingChannels(context: ExistingContext) {
    return {
      channels: [{ id: "C123", name: context.name, private: false }],
      nextCursor: null,
    };
  },
  async sendMessage(_context: ExistingContext, input) {
    return { channelId: input.channelId, messageId: "ABC123" };
  },
};
// The optional context must be inferred from the packed declarations without host internals.
const adapter: ChannelMessagingAdapterV1<
  ExistingContext,
  ExistingContext & ChannelMessagingReferencesContextV1
> = {
  listMessagingChannels: legacyAdapter.listMessagingChannels,
  async sendMessage(context, input) {
    const service: ChannelMessagingReferencesServiceV1 | undefined =
      context.messagingReferences;
    if (service?.schemaVersion === "1") {
      for (const request of requests) {
        const result: ChannelMessagingReferenceV1 | null =
          await service.resolve(request);
        if (result?.kind === "sent_message") {
          const text: string = result.text;
          const messageId: string = result.messageId;
          if (!text || !messageId)
            throw new Error("Invalid sent-message reference.");
        } else if (result?.kind === "destination") {
          const provider: "teams" = result.routing.provider;
          const serviceUrl: string = result.routing.serviceUrl;
          if (!provider || !serviceUrl)
            throw new Error("Invalid destination reference.");
        }
      }
    }
    return legacyAdapter.sendMessage(context, input);
  },
};
const context: ExistingContext & ChannelMessagingReferencesContextV1 = {
  name: "Fixture",
  messagingReferences: references,
};
void adapter.sendMessage(context, { channelId: "wa:chat", text: "Follow-up" });
// Older hosts omit the resolver; both old and new adapters still type-check.
void adapter.sendMessage(
  { name: "Older host" },
  { channelId: "C123", text: "New message" },
);
void legacyAdapter.sendMessage(
  { name: "Older host" },
  { channelId: "C123", text: "New message" },
);

// Existing generic dispatchers and non-object contexts remain valid public consumers.
function dispatch<Context>(
  adapter: ChannelMessagingAdapterV1<Context>,
  context: Context,
) {
  return adapter.sendMessage(context, {
    channelId: "C123",
    text: "New message",
  });
}
const contextFree: ChannelMessagingAdapterV1<void> = {
  async listMessagingChannels() {
    return { channels: [], nextCursor: null };
  },
  async sendMessage(_context, input) {
    return { channelId: input.channelId, messageId: "ABC123" };
  },
};
void contextFree.sendMessage(undefined, {
  channelId: "C123",
  text: "New message",
});
void dispatch(contextFree, undefined);

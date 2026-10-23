import {
  CHANNEL_MESSAGING_REFERENCES_MAX_CALLS,
  type ChannelMessagingReferencesServiceV1,
  type ChannelMessagingReferenceV1,
} from "../contracts/channel-messaging-references.js";
import {
  validateChannelMessagingReferenceRequest,
  validateChannelMessagingReferenceResult,
} from "../validation/channel-messaging-references.js";

/** Test fixture only: supplied records represent an already-authorized host scope. */
export function createChannelMessagingReferencesHarness(
  records: readonly ChannelMessagingReferenceV1[],
): ChannelMessagingReferencesServiceV1 {
  // Detached fixtures prevent callers mutating a simulated trusted reference after setup.
  const snapshot = records.map((record) => {
    if (validateChannelMessagingReferenceResult(record).length)
      throw new Error("Invalid channel messaging reference fixture.");
    return structuredClone(record);
  });
  let calls = 0;
  return {
    schemaVersion: "1",
    async resolve(input) {
      calls += 1;
      if (calls > CHANNEL_MESSAGING_REFERENCES_MAX_CALLS)
        throw new Error("Channel messaging reference lookup limit exceeded.");
      if (validateChannelMessagingReferenceRequest(input).length)
        throw new Error("Invalid channel messaging reference request.");
      const found = snapshot.find(
        (record) =>
          record.kind === input.kind &&
          record.channelId === input.channelId &&
          (record.kind !== "sent_message" ||
            (input.kind === "sent_message" &&
              record.messageId === input.messageId)),
      );
      return found ? structuredClone(found) : null;
    },
  };
}

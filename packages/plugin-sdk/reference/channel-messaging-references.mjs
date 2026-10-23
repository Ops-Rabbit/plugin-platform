import {
  validateChannelMessagingReferenceRequest,
  validateChannelMessagingReferenceResult,
} from "@opsrabbit/plugin-sdk";

/** Call from an already-authorized provider adapter, never a model-facing tool. */
export async function resolveChannelMessagingReference(context, input) {
  if (validateChannelMessagingReferenceRequest(input).length)
    throw new Error("Invalid channel messaging reference request.");
  const references = context.messagingReferences;
  if (references?.schemaVersion !== "1")
    throw new Error("Channel messaging references are unavailable.");
  const reference = await references.resolve(input);
  if (validateChannelMessagingReferenceResult(reference, input).length)
    throw new Error(
      "Invalid or mismatched channel messaging reference result.",
    );
  return reference;
}

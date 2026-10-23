import {
  validateChannelMessagingReferenceRequest,
  validateChannelMessagingReferenceResult,
} from "@opsrabbit/plugin-sdk";

/** Call from an already-authorized provider adapter, never a model-facing tool. */
export async function resolveChannelMessagingReference(context, input) {
  if (validateChannelMessagingReferenceRequest(input).length)
    throw new Error("Invalid channel messaging reference request.");
  const request = Object.freeze(globalThis.structuredClone(input));
  const references = context.messagingReferences;
  if (references?.schemaVersion !== "1")
    throw new Error("Channel messaging references are unavailable.");
  const reference = await references.resolve(request);
  if (validateChannelMessagingReferenceResult(reference, request).length)
    throw new Error(
      "Invalid or mismatched channel messaging reference result.",
    );
  if (reference === null) return null;
  const result = globalThis.structuredClone(reference);
  if (result.kind === "destination") Object.freeze(result.routing);
  return Object.freeze(result);
}

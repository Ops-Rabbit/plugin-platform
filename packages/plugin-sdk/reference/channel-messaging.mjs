import { validateChannelMessagingInput } from "@opsrabbit/plugin-sdk";

/** Executable reference: broker is host-bound; the tool never receives credentials. */
export async function sendChannelMessage(context, input) {
  if (context.messaging?.schemaVersion !== "1") {
    throw new Error("Channel messaging is unavailable for this invocation.");
  }
  if (validateChannelMessagingInput(input).length > 0) {
    throw new Error("Invalid channel message input.");
  }
  if (
    input.threadId !== undefined &&
    context.messaging.supportsThreadReplies !== true
  ) {
    throw new Error("Thread replies are unavailable for this invocation.");
  }
  return context.messaging.sendMessage(input);
}

import { validateInboundLifecycleEvent } from "@opsrabbit/plugin-sdk";

/**
 * Executable host-adapter reference. Authentication, enabled binding, live
 * grants, policy revision and durable delivery admission must precede this call.
 * Successful completion acknowledges only the consumer transaction, not the
 * investigation. This helper intentionally does not persist or retry anything.
 */
export async function deliverInboundLifecycleEvent(definition, event, context) {
  if (context.signal.aborted) throw context.signal.reason;
  if (
    !definition ||
    definition.schemaVersion !== "1" ||
    typeof definition.handle !== "function"
  ) {
    throw new Error("Inbound lifecycle handler is unavailable.");
  }
  if (validateInboundLifecycleEvent(event).length !== 0) {
    throw new Error("Invalid Inbound lifecycle event.");
  }
  if (context.tenantId !== event.tenantId) {
    throw new Error("Inbound lifecycle tenant mismatch.");
  }
  await definition.handle(event, context);
}

import { validatePluginInboundConfiguration } from "@opsrabbit/plugin-sdk";

/** Core owns the checkbox. Plugin configuration copies, but cannot change, live enablement. */
export async function saveInboundBusinessConfiguration(
  context,
  capability,
  input,
  persist,
) {
  context.signal.throwIfAborted();
  if (
    !context.resourceRecords ||
    validatePluginInboundConfiguration(input, capability).length
  )
    throw new Error("Invalid or unsupported Inbound business configuration.");
  const sources = await context.resourceRecords.sourceInbounds();
  const source = sources.find(
    (item) =>
      item.id === input.inboundId && item.incarnationId === input.incarnationId,
  );
  if (!source) throw new Error("Source Inbound is unavailable.");
  return context.resourceRecords.transaction(
    { kind: capability.resourceKind, purpose: "configuration" },
    async (transaction) => {
      const binding = await transaction.bindSourceInbound({
        inboundId: source.id,
        kind: capability.resourceKind,
        enabled: source.binding?.enabled ?? false,
        expectedRevision: input.revision,
        expectedIncarnationId: input.incarnationId,
      });
      context.signal.throwIfAborted();
      // Store immutable business configuration for this host binding revision.
      await persist(transaction.database, {
        ...input,
        revision: binding.revision,
      });
      context.signal.throwIfAborted();
      return { ...input, revision: binding.revision };
    },
  );
}

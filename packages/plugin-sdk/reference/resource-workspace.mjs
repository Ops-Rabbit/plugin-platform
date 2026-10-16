import {
  validatePluginResourceQuery,
  validatePluginResourceRegistration,
  validatePluginResourceDeletion,
  validateStructuredEnrichmentInput,
  validateStructuredEnrichmentResult,
} from "@opsrabbit/plugin-sdk";

/** The real host supplies live authorization and persistence fences, not this helper. */
function admitted(context) {
  context.signal.throwIfAborted();
  if (!context.tenantId || !context.actor?.id)
    throw new Error("Explicit tenant and actor are required.");
}
export async function queryRegisteredResources(context, query) {
  admitted(context);
  if (validatePluginResourceQuery(query).length)
    throw new Error("Invalid resource query.");
  if (!context.resourceRecords)
    throw new Error("Resource records are unavailable on this host.");
  return context.resourceRecords.query(query);
}

/** Register and canonical writes are one transaction; host policy runs before entry. */
export async function createRegisteredResource(context, registration, write) {
  admitted(context);
  if (validatePluginResourceRegistration(registration).length)
    throw new Error("Invalid resource registration.");
  if (!context.resourceRecords)
    throw new Error("Resource records are unavailable on this host.");
  return context.resourceRecords.transaction(
    {
      kind: registration.kind,
      purpose: "records",
      operation: "create",
      ids: [registration.id],
    },
    async (transaction) => {
      const ownership = await transaction.register(registration);
      return write(transaction.database, ownership.ownerUserId);
    },
  );
}

/** Called only after the host fences hold/policy/active work and binds a transaction. */
export async function deleteRegisteredResources(definition, input, context) {
  context.signal.throwIfAborted();
  if (!context.tenantId) throw new Error("Explicit tenant is required.");
  if (validatePluginResourceDeletion(input).length)
    throw new Error("Invalid resource deletion.");
  if (
    definition?.schemaVersion !== "1" ||
    typeof definition.deleteRecords !== "function"
  )
    throw new Error("Resource lifecycle handler is unavailable.");
  await definition.deleteRecords(input, context);
}

export async function enrichRegisteredResource(context, input) {
  admitted(context);
  if (validateStructuredEnrichmentInput(input).length)
    throw new Error("Invalid enrichment input.");
  if (!context.structuredEnrichment)
    throw new Error("Structured enrichment is unavailable on this host.");
  const result = await context.structuredEnrichment.enrich(input);
  context.signal.throwIfAborted();
  if (validateStructuredEnrichmentResult(result, input).length)
    throw new Error("Invalid enrichment result.");
  return result;
}

/** Always called under the host's tenant deletion fence, including zero-record tenants. */
export async function cleanupRegisteredResourceTenant(definition, context) {
  context.signal.throwIfAborted();
  if (!context.tenantId) throw new Error("Explicit tenant is required.");
  if (
    definition?.schemaVersion !== "1" ||
    typeof definition.cleanupTenant !== "function"
  )
    throw new Error("Resource tenant cleanup is unavailable.");
  const result = await definition.cleanupTenant(context);
  if (!result || typeof result.complete !== "boolean")
    throw new Error("Invalid tenant cleanup result.");
  return result;
}

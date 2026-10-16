import type { PluginInvocationContext } from "./contexts.js";

export const INBOUND_LIFECYCLE_SCHEMA_VERSION = "1" as const;
export const INBOUND_LIFECYCLE_EVENT_TYPES = [
  "received",
  "correlated",
  "investigation_updated",
  "writeback_updated",
  "deleted",
] as const;
export type InboundLifecycleEventType =
  (typeof INBOUND_LIFECYCLE_EVENT_TYPES)[number];

/** Approved source content only. Never pass raw payloads or credentials. */
export interface InboundReceivedChangeV1 {
  readonly type: "received";
  readonly title: string;
  readonly description?: string;
  readonly upstreamIncidentId?: string;
  readonly severity?: string;
}
export type InboundCorrelatedChangeV1 = {
  readonly type: "correlated";
  readonly reason?: string;
} & (
  | { readonly disposition: "joined"; readonly threadId: string }
  | { readonly disposition: "new" | "suppressed"; readonly threadId?: string }
);
export interface InboundInvestigationChangeV1 {
  readonly type: "investigation_updated";
  readonly threadId: string;
  readonly turnId: string;
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
}
export interface InboundWritebackChangeV1 {
  readonly type: "writeback_updated";
  readonly operationId: string;
  readonly status: "pending" | "succeeded" | "failed" | "not_required";
}
export interface InboundDeletedChangeV1 {
  readonly type: "deleted";
}

/**
 * Host-attested event delivered at least once to a tenant-bound handler.
 * eventId identifies a delivery-independent event, not a source incident.
 * revision is monotonic for one (tenantId, inboundId, sourceEventId).
 * Consumers key every receipt/revision/deletion by the full origin tuple
 * (tenantId, inboundId, sourceEventId). Within that origin, merge revisions by:
 * received/correlated: change.type; investigation: (change.type, threadId, turnId);
 * writeback: (change.type, operationId). Never compare independent entity revisions.
 * Events may arrive out of order; a newer writeback must not erase received fields.
 * Deletion is terminal only for the full origin tuple and fences all its changes.
 * occurredAt is UTC; receivedAt/processing clocks must not be substituted.
 */
export interface InboundLifecycleEventV1 {
  readonly schemaVersion: "1";
  readonly eventId: string;
  readonly tenantId: string;
  readonly inboundId: string;
  readonly sourceEventId: string;
  /** Stable source account/system scope, assigned by trusted binding configuration. */
  readonly sourceSystemId: string;
  /** Binding configuration revision captured when this event was admitted. */
  readonly bindingRevision: number;
  readonly revision: number;
  readonly occurredAt: string;
  readonly change:
    | InboundReceivedChangeV1
    | InboundCorrelatedChangeV1
    | InboundInvestigationChangeV1
    | InboundWritebackChangeV1
    | InboundDeletedChangeV1;
}

export interface InboundLifecycleDefinitionV1 {
  readonly schemaVersion: "1";
  /** Resolve only after incident mutation and delivery receipt commit together. */
  handle(
    event: InboundLifecycleEventV1,
    context: PluginInvocationContext,
  ): Promise<void>;
}

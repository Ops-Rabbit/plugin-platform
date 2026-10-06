/** Additive host capability; it never grants a plugin arbitrary approval access. */
export const CHANNEL_APPROVAL_VERSION = "1" as const;

export interface ChannelApprovalActorV1 {
  provider: string;
  workspaceId: string;
  userId: string;
  displayName: string;
}

export type ChannelApprovalStateV1 =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled"
  | "disabled";

export interface ChannelApprovalDeliveryV1 {
  schemaVersion: typeof CHANNEL_APPROVAL_VERSION;
  deliveryId: string;
  claimToken: string;
  approvalId: string;
  threadId: string;
  turnId: string;
  externalConversationKey: string;
  workspaceId: string;
  botUserId: string;
  state: ChannelApprovalStateV1;
  tool: string;
  command: string;
  summary: string;
  agent: string;
  expiresAt: string;
  resolvedAt: string | null;
  actor: ChannelApprovalActorV1 | null;
  webActorUserId: string | null;
  messageId: string | null;
  receiptMessageId: string | null;
  /** A prior remote POST may have succeeded without an acknowledged response. */
  uncertain: boolean;
}

export interface ChannelApprovalDecisionV1 {
  schemaVersion: typeof CHANNEL_APPROVAL_VERSION;
  deliveryId: string;
  externalConversationKey: string;
  messageId: string;
  botUserId: string;
  actor: ChannelApprovalActorV1;
  decision: "allow-once" | "deny";
}

/** Parent-deletion work contains locators only, never the deleted review content. */
export interface ChannelApprovalCleanupV1 {
  schemaVersion: typeof CHANNEL_APPROVAL_VERSION;
  cleanupId: string;
  claimToken: string;
  deliveryId: string;
  externalConversationKey: string;
  workspaceId: string;
  botUserId: string;
  messageId: string | null;
  receiptMessageId: string | null;
  /** Recover possible unacknowledged posts before acknowledging cleanup. */
  uncertain: boolean;
}

export type ChannelApprovalCleanupOutcomeV1 = "deleted" | "already_absent";

export interface ChannelApprovalServiceV1 {
  readonly schemaVersion: typeof CHANNEL_APPROVAL_VERSION;
  /** Called only after provider authentication verifies the installation. */
  bindInstallation(input: {
    workspaceId: string;
    botUserId: string;
  }): Promise<void>;
  /** Bounded host-fenced work; canonical state includes web decisions and expiry. */
  claimDeliveries(): Promise<ChannelApprovalDeliveryV1[]>;
  completeDelivery(input: {
    deliveryId: string;
    claimToken: string;
    messageId: string;
    receiptMessageId: string | null;
    presentedState: ChannelApprovalStateV1;
  }): Promise<void>;
  failDelivery(input: {
    deliveryId: string;
    claimToken: string;
    code: "provider_error" | "missing_scope";
    /** True if a remote post may have succeeded without a durable local record. */
    uncertain: boolean;
  }): Promise<void>;
  /** Leased cleanup tombstones survive parent deletion until a durable outcome. */
  claimCleanups(): Promise<ChannelApprovalCleanupV1[]>;
  /** Both the card and receipt must be removed/absent before acknowledging. */
  completeCleanup(input: {
    cleanupId: string;
    claimToken: string;
    outcome: ChannelApprovalCleanupOutcomeV1;
  }): Promise<void>;
  /** Failure never becomes successful cleanup or permission to repost content. */
  failCleanup(input: {
    cleanupId: string;
    claimToken: string;
    code: "provider_error" | "missing_scope" | "installation_unavailable";
  }): Promise<void>;
  /**
   * Provider adapter MUST verify authenticated interaction provenance, active
   * human identity and current access to the original conversation before calling.
   * Host independently checks instance/tenant/binding and current runtime authority.
   * Decision and external actor audit commit atomically before execution resumes.
   */
  resolve(input: ChannelApprovalDecisionV1): Promise<{
    applied: boolean;
    state: ChannelApprovalStateV1;
    actor: ChannelApprovalActorV1 | null;
    resolvedAt: string | null;
  }>;
}

export interface ChannelApprovalContextV1 {
  readonly approvals?: ChannelApprovalServiceV1;
}

export interface ChannelApprovalAdapterV1 {
  /** Host invokes on changes, startup and bounded shared-scheduler reconciliation. */
  deliverApprovals(context: ChannelApprovalContextV1): Promise<void>;
}

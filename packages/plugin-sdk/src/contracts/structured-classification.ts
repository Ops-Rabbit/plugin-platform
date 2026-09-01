export const STRUCTURED_CLASSIFICATION_SCHEMA_VERSION = "1" as const;

export const STRUCTURED_CLASSIFICATION_LIMITS = Object.freeze({
  maximumClasses: 32,
  maximumQualificationRequirements: 16,
  maximumEvidenceItems: 64,
  maximumContentBytes: 65_536,
  maximumEvidenceTextBytes: 16_384,
  maximumInstructionsBytes: 8_192,
  maximumReasonBytes: 4_096,
  maximumMissingEvidenceItems: 32,
  minimumTimeoutMs: 1_000,
  maximumTimeoutMs: 120_000,
});

export interface PluginStructuredClassificationClassV1 {
  /** Stable machine key persisted by the plugin. */
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly qualificationRequirements: readonly string[];
}

export interface PluginStructuredClassificationEvidenceV1 {
  /** Stable invocation-local reference; the host does not dereference it. */
  readonly id: string;
  readonly text: string;
}

export interface PluginStructuredClassificationInputV1 {
  readonly schemaVersion: typeof STRUCTURED_CLASSIFICATION_SCHEMA_VERSION;
  readonly content: string;
  readonly instructions: string;
  readonly classes: readonly PluginStructuredClassificationClassV1[];
  readonly evidence: readonly PluginStructuredClassificationEvidenceV1[];
  /** Requested deadline; the host may enforce a shorter deadline. */
  readonly timeoutMs: number;
}

export interface PluginStructuredClassificationCompletedV1 {
  readonly status: "completed";
  readonly recommendedClassKey: string;
  readonly confidence: number;
  readonly reason: string;
  /** IDs copied only from input.evidence. */
  readonly evidenceRefs: readonly string[];
  readonly missingEvidence: readonly string[];
}

export interface PluginStructuredClassificationUnavailableV1 {
  readonly status: "unavailable";
  readonly reason: "not_configured" | "policy_blocked" | "capacity_unavailable";
}

export interface PluginStructuredClassificationTimeoutV1 {
  readonly status: "timeout";
}

export type PluginStructuredClassificationResultV1 =
  | PluginStructuredClassificationCompletedV1
  | PluginStructuredClassificationUnavailableV1
  | PluginStructuredClassificationTimeoutV1;

/** Optional, host-authorized, tenant-scoped structured-classification broker. */
export interface PluginStructuredClassificationService {
  /**
   * Resolves `timeout` only when the requested or host-enforced broker deadline
   * expires. If the enclosing plugin invocation is cancelled, this promise
   * rejects with that invocation context's `signal.reason`; cancellation is
   * never converted into `timeout` or `unavailable`.
   */
  classify(
    input: PluginStructuredClassificationInputV1,
  ): Promise<PluginStructuredClassificationResultV1>;
}

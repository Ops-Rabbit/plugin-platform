import type { JsonValue } from "./manifest.js";
import type { OpsRabbitWorkspaceError } from "./frontend.js";

/**
 * Manifest permission binding for host-executed agent runs. Instructions and
 * inputs are supplied for each run. Tools, skills, limits and other run
 * resources are host policy: the host decides them, never the plugin.
 */
export interface PluginAgentRunBindingV1 {
  readonly id: string;
  /** Required tenant string settings, each holding the name of a tenant-owned agent. */
  readonly agentSettingKeys: readonly string[];
  readonly startActionId: string;
  readonly getActionId: string;
  readonly cancelActionId: string;
  readonly completionHandlerId: string;
  /** Reviewed instructions a run may select by id instead of supplying its own. */
  readonly presets?: readonly PluginAgentRunPresetV1[];
}

export interface PluginAgentRunPresetV1 {
  readonly id: string;
  readonly instructions: string;
}

export interface PluginAgentRunsCapabilityV1 {
  readonly schemaVersion: "1";
  readonly bindings: readonly PluginAgentRunBindingV1[];
}

/** One run request. Supply exactly one of `instructions` or `presetId`. */
export interface PluginAgentRunRequestV1 {
  readonly schemaVersion: "1";
  readonly bindingId: string;
  readonly agentSettingKey: string;
  readonly instructions?: string;
  readonly presetId?: string;
  readonly inputs: JsonValue;
  /** Optional bounded output schema; see `validatePluginAgentRunOutputSchema`. */
  readonly outputSchema?: JsonValue;
}

/**
 * Request as accepted by the host and returned by `parsePluginAgentRunRequestV1`.
 * `instructions` is always resolved; when a preset was selected `presetId` is
 * kept as provenance, so this is not itself a valid start request.
 */
export type PluginAgentRunAcceptedRequestV1 = Omit<
  PluginAgentRunRequestV1,
  "instructions"
> & { readonly instructions: string };

export type PluginAgentRunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "access_revoked";

export type PluginAgentRunDeliveryStatus =
  | "pending"
  | "delivering"
  | "delivered"
  | "delivery_failed";

export type PluginAgentRunProgressCode =
  | "queued"
  | "running"
  | "preparing_result"
  | "delivering_result";

export type PluginAgentRunErrorCode =
  | "EXECUTION_FAILED"
  | "RESULT_INVALID"
  | "ACCESS_REVOKED"
  | "DEADLINE_EXCEEDED"
  | "DELIVERY_FAILED";

/**
 * Host-attested accepted request kept separate from untrusted agent output.
 * `requestDigest` is the lowercase hex SHA-256 of the canonical accepted request
 * (instructions resolved from a preset), so a plugin can verify the binding.
 */
export type PluginAgentRunResultV1 = Readonly<
  Record<string, JsonValue> & {
    readonly kind: "execution_v1";
    readonly request: JsonValue;
    readonly requestDigest: string;
    readonly output: JsonValue;
  }
>;

/** Observation omits the request; read it through the bound get action when needed. */
export type PluginAgentRunObservedResultV1 = Readonly<
  Record<string, JsonValue> & {
    readonly kind: "execution_v1";
    readonly requestDigest: string;
    readonly output: JsonValue;
  }
>;

type PluginAgentRunSnapshotFields<Result> = Readonly<
  Record<string, JsonValue> & {
    readonly runId: string;
    readonly bindingId: string;
    readonly status: PluginAgentRunStatus;
    readonly progressCode: PluginAgentRunProgressCode;
    readonly deliveryStatus: PluginAgentRunDeliveryStatus | null;
    readonly result: Result | null;
    readonly errorCode: PluginAgentRunErrorCode | null;
    readonly createdAt: string;
    readonly startedAt: string | null;
    readonly endedAt: string | null;
  }
>;

/** Returned by `get` and `cancel`. */
export type PluginAgentRunSnapshotV1 =
  PluginAgentRunSnapshotFields<PluginAgentRunResultV1>;

/** Carried by frontend observation; it never contains the run request. */
export type PluginAgentRunObservedSnapshotV1 =
  PluginAgentRunSnapshotFields<PluginAgentRunObservedResultV1>;

export interface PluginAgentRunsServiceV1 {
  /** Durably accepts a run and returns its opaque id. Not idempotent: do not retry blindly. */
  start(input: PluginAgentRunRequestV1): Promise<{ runId: string }>;
  get(input: { runId: string }): Promise<PluginAgentRunSnapshotV1>;
  /** Requests cancellation; a run that already settled is returned unchanged. */
  cancel(input: { runId: string }): Promise<PluginAgentRunSnapshotV1>;
}

/** Only the host may invoke a completion handler; values are host-attested. */
export interface PluginAgentRunCompletionV1 {
  readonly runId: string;
  readonly tenantId: string;
  readonly initiatingActorId: string;
  readonly bindingId: string;
  readonly result: PluginAgentRunResultV1;
}

export interface PluginAgentRunCompletionContextV1 {
  readonly tenantId: string;
  readonly signal: AbortSignal;
}

/**
 * Notification of a succeeded run. Delivery is at most once and is not replayed;
 * the canonical result stays readable through the bound get action.
 */
export interface PluginAgentRunCompletionDefinitionV1 {
  readonly id: string;
  handle(
    delivery: PluginAgentRunCompletionV1,
    context: PluginAgentRunCompletionContextV1,
  ): Promise<void>;
}

export interface PluginAgentRunStateV1 {
  readonly schemaVersion: "1";
  /** Run-local committed BIGINT revision, represented without precision loss. */
  readonly revision: string;
  readonly snapshot: PluginAgentRunObservedSnapshotV1;
}

export type PluginAgentRunObservationEventV1 =
  | { readonly type: "state"; readonly state: PluginAgentRunStateV1 }
  | {
      readonly type: "connection";
      readonly state: "connecting" | "live" | "reconnecting";
    }
  | {
      readonly type: "closed";
      readonly reason: "settled" | "access_ended" | "unavailable";
    };

export interface PluginAgentRunObserverV1 {
  onEvent(event: PluginAgentRunObservationEventV1): void;
  onError(error: OpsRabbitWorkspaceError): void;
}

export interface PluginAgentRunObservationV1 {
  close(): void;
}

export interface PluginAgentRunFrontendServiceV1 {
  /** Initial and reconnect snapshots are canonical; disconnect never cancels execution. */
  observe(
    input: { runId: string },
    observer: PluginAgentRunObserverV1,
  ): PluginAgentRunObservationV1;
}

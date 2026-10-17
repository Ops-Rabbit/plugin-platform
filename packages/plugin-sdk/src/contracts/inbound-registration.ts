import type { JsonValue } from "./manifest.js";

/** Declarative configuration only. Core owns enablement, grants and delivery. */
export interface PluginInboundRegistrationCapabilityV1 {
  readonly schemaVersion: "1";
  readonly resourceKind: string;
  readonly sourceProviders: readonly string[];
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly configuration?: {
    readonly readActionId: string;
    readonly writeActionId: string;
    readonly fields: readonly {
      readonly key: string;
      readonly labelKey: string;
      readonly descriptionKey?: string;
      readonly type: "boolean" | "text" | "json";
      readonly default: JsonValue;
    }[];
  };
}

export interface PluginInboundConfigurationRequestV1 {
  readonly inboundId: string;
}
export interface PluginInboundConfigurationV1 {
  readonly inboundId: string;
  readonly incarnationId: string;
  /** Current host binding revision, used as an optimistic concurrency fence. */
  readonly revision: number;
  readonly values: Readonly<Record<string, JsonValue>>;
}
export type PluginInboundConfigurationUpdateV1 = PluginInboundConfigurationV1;

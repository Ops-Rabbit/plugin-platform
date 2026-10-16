export type PluginEnrichmentValue = string | number | boolean | null;
export type PluginEnrichmentFieldV1 = { readonly label: string } & (
  | { readonly type: "enum"; readonly enumValues: readonly string[] }
  | {
      readonly type: "text" | "number" | "boolean" | "date";
      readonly enumValues?: never;
    }
);
export interface PluginStructuredEnrichmentInputV1 {
  readonly schemaVersion: "1";
  readonly resource: { readonly kind: string; readonly id: string };
  readonly title: string;
  readonly description: string;
  readonly generateTitle: boolean;
  /** Allowed business fields only. Identity/routing/grant fields are forbidden. */
  readonly fields: Readonly<Record<string, PluginEnrichmentFieldV1>>;
  readonly timeoutMs: number;
}
export type PluginStructuredEnrichmentResultV1 =
  | {
      readonly status: "completed";
      readonly title?: string;
      readonly values: Readonly<Record<string, PluginEnrichmentValue>>;
    }
  | {
      readonly status: "unavailable";
      readonly reason:
        | "not_configured"
        | "policy_blocked"
        | "capacity_unavailable";
    }
  | { readonly status: "timeout" };
export interface PluginStructuredEnrichmentService {
  /**
   * Uses the tenant's approved model. Source text is untrusted data, never tool
   * instructions; no tools or durable memory are available. Host bounds content,
   * validates output against requested fields and audits metadata without content.
   * Invocation cancellation rejects; broker deadline returns timeout. Plugins must
   * revision-fence results and preserve manual titles, including disable races.
   */
  enrich(
    input: PluginStructuredEnrichmentInputV1,
  ): Promise<PluginStructuredEnrichmentResultV1>;
}

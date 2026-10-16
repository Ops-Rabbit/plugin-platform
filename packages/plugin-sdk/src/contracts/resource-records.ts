import type { TransactionBoundPluginDatabase } from "./contexts.js";
import type { JsonValue } from "./manifest.js";

export const PLUGIN_RESOURCE_RECORDS_SCHEMA_VERSION = "1" as const;
export type PluginSqlParameter = string | number | boolean | null;

/** Host-owned metadata only. Canonical customer content remains in plugin SQL. */
export interface PluginResourceKindV1 {
  readonly labelKey: string;
  readonly descriptionKey: string;
  /** Shared retention catalog key is namespaced by host: plugin:<pluginId>:<key>. */
  readonly retention: {
    readonly defaultMode: "retain_indefinitely";
    readonly supportedModes: readonly (
      | "do_not_persist"
      | "retain_for_days"
      | "retain_indefinitely"
    )[];
  };
}
export interface PluginResourceRecordsCapabilityV1 {
  readonly schemaVersion: "1";
  readonly kinds: Readonly<Record<string, PluginResourceKindV1>>;
}

/**
 * Candidates are one row per resource, projecting tenant_id and resource_id.
 * SQL and parameters are plugin-authored; browser input must be bound parameters.
 * Host checks read-only SQL and plugin-schema boundaries, then joins its own live
 * resource index/grants. It applies order, paging, counts and grouping AFTER that
 * join. Plugins must not add paging or pre-aggregate hidden records in candidates.
 */
export interface PluginResourceQueryV1 {
  readonly schemaVersion: "1";
  readonly kind: string;
  readonly tenantIds: "all" | readonly string[];
  readonly candidates: {
    readonly sql: string;
    readonly parameters: readonly PluginSqlParameter[];
  };
  readonly orderBy: readonly {
    readonly column: string;
    readonly direction: "asc" | "desc";
  }[];
  readonly page: number;
  readonly pageSize: number;
  /** Group/count authorized candidates only. No unrestricted analytics copy. */
  readonly groupBy?: string;
}
export interface PluginResourceQueryResultV1 {
  readonly rows: readonly {
    readonly tenantId: string;
    readonly id: string;
    readonly values: Readonly<Record<string, JsonValue>>;
    readonly permissions: Readonly<
      Record<"read" | "use" | "write" | "manage", boolean>
    >;
    /** Only associated investigations the current caller can read. */
    readonly investigations: readonly { readonly threadId: string }[];
  }[];
  readonly groups?: readonly {
    readonly value: JsonValue;
    readonly count: number;
  }[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
export interface PluginResourceRegistrationV1 {
  readonly kind: string;
  readonly id: string;
  /** The eligibility clock is immutable after first registration. */
  readonly eligibleAt: string;
}
export interface PluginResourceConfigurationTransactionV1 {
  readonly database: TransactionBoundPluginDatabase;
  /** Tenant-admin-only. Host binding and plugin mapping history commit together. */
  bindSourceInbound(
    input: PluginSourceInboundBindingV1,
  ): Promise<{ readonly revision: number; readonly enabledAt: string | null }>;
}
export interface PluginResourceTransactionV1 {
  readonly database: TransactionBoundPluginDatabase;
  /**
   * Stamps authenticated owner, tenant and attested Inbound output origin.
   * Applies live persistence policy before canonical writes and audits atomically.
   * Register and canonical SQL mutation must commit in this same transaction.
   */
  register(
    input: PluginResourceRegistrationV1,
  ): Promise<{ readonly ownerUserId: string }>;
  /** Verifies same-tenant thread and adds only this attested Inbound's output grants. */
  linkInvestigation(input: {
    readonly kind: string;
    readonly id: string;
    readonly threadId: string;
  }): Promise<void>;
}
export interface PluginSourceInboundBindingV1 {
  readonly inboundId: string;
  readonly kind: string;
  readonly enabled: boolean;
}
export interface PluginSourceInboundV1 {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  readonly binding?: {
    readonly kind: string;
    readonly enabled: boolean;
    readonly revision: number;
    readonly enabledAt: string | null;
  };
}
export type PluginResourceTransactionInputV1 =
  | {
      readonly kind: string;
      readonly purpose: "records";
      readonly operation: "create" | "write";
      readonly ids: readonly string[];
    }
  | { readonly kind: string; readonly purpose: "configuration" };

export interface PluginResourceRecordsService {
  /** Live accessible/effectively-enabled tenants; never returns hidden tenant metadata. */
  scope(): Promise<
    readonly {
      readonly id: string;
      readonly name: string;
      readonly role: "viewer" | "operator" | "admin";
    }[]
  >;
  /** Tenant-admin-only source catalog for this invocation's tenant; no secrets/settings. */
  sourceInbounds(): Promise<readonly PluginSourceInboundV1[]>;
  /** Each call revalidates actor, memberships, roles, plugin enablement and grants. */
  query(input: PluginResourceQueryV1): Promise<PluginResourceQueryResultV1>;
  /**
   * Requires explicit write authority; GET/read invocations reject. Record mode
   * fences and enforces persistence policy BEFORE invoking the callback. The
   * configuration mode is tenant-admin-only and cannot register/link records.
   */
  transaction<T>(
    input: Extract<PluginResourceTransactionInputV1, { purpose: "records" }>,
    run: (transaction: PluginResourceTransactionV1) => Promise<T>,
  ): Promise<T>;
  transaction<T>(
    input: Extract<
      PluginResourceTransactionInputV1,
      { purpose: "configuration" }
    >,
    run: (transaction: PluginResourceConfigurationTransactionV1) => Promise<T>,
  ): Promise<T>;
}

export interface PluginResourceDeletionV1 {
  readonly schemaVersion: "1";
  readonly kind: string;
  readonly ids: readonly string[];
  readonly reason:
    | "retention"
    | "manual"
    | "tenant_deleted"
    | "restore_reconciliation";
}
export interface PluginResourceLifecycleDefinitionV1 {
  readonly schemaVersion: "1";
  /**
   * Runs after record batches, including zero-record tenants, under a tenant
   * deletion fence. Delete bounded configuration/preferences/remaining children;
   * return complete=false to resume in another transaction. Never skip this hook
   * merely because the resource index is empty. Core audits every batch atomically.
   */
  cleanupTenant(context: {
    readonly tenantId: string;
    readonly signal: AbortSignal;
    readonly database: TransactionBoundPluginDatabase;
  }): Promise<{ readonly complete: boolean }>;
  /**
   * Host first fences policy revision, holds, active work and replay; callback
   * deletes plugin content/children in the bound transaction. Failure rolls back
   * content, index and audit. Host deletes grants/index only after success.
   * Tenant deletion removes configuration, preferences and all derived stores too.
   */
  deleteRecords(
    input: PluginResourceDeletionV1,
    context: {
      readonly tenantId: string;
      readonly signal: AbortSignal;
      readonly database: TransactionBoundPluginDatabase;
    },
  ): Promise<void>;
}

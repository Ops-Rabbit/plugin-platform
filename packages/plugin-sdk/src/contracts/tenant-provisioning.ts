import type { OpsRabbitWorkspaceError } from "./frontend.js";

export const TENANT_PROVISIONING_SCHEMA_VERSION = "1" as const;
/** Frontend capability a native workspace requests to receive `context.tenantProvisioning`. */
export const TENANT_PROVISIONING_FRONTEND_CAPABILITY =
  "tenant.provisioning.manage" as const;
/** Largest tenant logo the host accepts, in bytes. */
export const TENANT_PROVISIONING_LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** Logo formats the host accepts; the host verifies the bytes, not the declared type. */
export const TENANT_PROVISIONING_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
/** Default and maximum page size for `listTenants`. */
export const TENANT_PROVISIONING_DEFAULT_PAGE_SIZE = 25;
export const TENANT_PROVISIONING_MAX_PAGE_SIZE = 100;

/**
 * Stable failure codes. The list is open: hosts may add codes in later minor versions, and
 * plugins must treat an unknown code as a failure.
 */
export const TENANT_PROVISIONING_ERROR_CODES = [
  "not_available",
  "forbidden",
  "not_found",
  "invalid_request",
  "slug_taken",
  "request_conflict",
  "account_unavailable",
  "credential_not_resettable",
  "license_limit",
  "logo_invalid",
  "logo_too_large",
  "host_error",
] as const;

export type TenantProvisioningErrorCodeV1 =
  (typeof TENANT_PROVISIONING_ERROR_CODES)[number];

export interface PluginTenantProvisioningErrorV1 extends OpsRabbitWorkspaceError {
  code: TenantProvisioningErrorCodeV1 | (string & {});
}

/**
 * Manifest declaration. Requires a native frontend that requests
 * `tenant.provisioning.manage` and workspace navigation that is not admin-only: the host opens
 * new tenants on that workspace.
 */
export interface PluginTenantProvisioningCapabilityV1 {
  schemaVersion: typeof TENANT_PROVISIONING_SCHEMA_VERSION;
  /** Enables `uploadLogo` and `getLogo`. Defaults to false. */
  logo?: boolean;
}

export type ProvisionedTenantStatusV1 = "active" | "disabled" | "archived";
export type TenantProvisioningLogoMimeTypeV1 =
  (typeof TENANT_PROVISIONING_LOGO_MIME_TYPES)[number];

export interface TenantProvisioningAuthorityV1 {
  /** Live host check. A UX hint only: the host re-authorizes every other call. */
  readonly deploymentAdmin: boolean;
}

export interface ProvisionedTenantLogoV1 {
  /**
   * URL the plugin may render in an `<img>`. Validation accepts a path or an absolute http(s)
   * URL; serving it from the host's own API origin is a host guarantee, not something the SDK
   * can check. The plugin keeps no copy.
   */
  readonly url: string;
  readonly mimeType: TenantProvisioningLogoMimeTypeV1;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly version: number;
}

/**
 * - `pending_first_sign_in`: a host-issued temporary password has not been changed yet.
 * - `active`: the user has set their own password.
 * - `not_managed`: the account existed before provisioning; the host never resets it here.
 */
export type ProvisionedAdminCredentialStateV1 =
  "pending_first_sign_in" | "active" | "not_managed";

export interface ProvisionedTenantAdminV1 {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly account: "created" | "existing";
  readonly credentialState: ProvisionedAdminCredentialStateV1;
}

export interface ProvisionedTenantV1 {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly status: ProvisionedTenantStatusV1;
  /** The calling plugin's workspace, opened full screen after sign-in. */
  readonly homePath: string;
  /** UTC with milliseconds, `YYYY-MM-DDTHH:MM:SS.sssZ`. */
  readonly createdAt: string;
  /** The first admin; null when that user no longer exists. */
  readonly admin: ProvisionedTenantAdminV1 | null;
  readonly logo: ProvisionedTenantLogoV1 | null;
}

export interface CreateCustomerRequestV1 {
  /** Client-generated retry key, 16-128 characters of `[A-Za-z0-9_-]`. */
  readonly requestId: string;
  readonly tenant: {
    /** Canonical tenant slug: 2-80 lowercase letters, digits, or inner dashes. */
    readonly slug: string;
    readonly displayName: string;
  };
  readonly admin: {
    readonly email: string;
    readonly displayName: string;
  };
}

/**
 * Returned exactly once, on the response that issued it. Show it to the deployment admin once,
 * then drop it: never store, log, send, or audit it.
 */
export interface TemporaryPasswordCredentialV1 {
  readonly kind: "temporary_password";
  readonly value: string;
}

export interface NoCredentialV1<Reason extends string> {
  readonly kind: "none";
  readonly reason: Reason;
}

export interface CreatedCustomerAdminV1 {
  readonly userId: string;
  readonly email: string;
  readonly account: "created" | "existing";
}

export type CreateCustomerResultV1 =
  | {
      readonly outcome: "created";
      readonly tenant: ProvisionedTenantV1;
      readonly admin: CreatedCustomerAdminV1;
      readonly credential:
        TemporaryPasswordCredentialV1 | NoCredentialV1<"existing_account">;
    }
  | {
      /** Same `requestId` and payload as an earlier call. Never carries a credential. */
      readonly outcome: "replayed";
      readonly tenant: ProvisionedTenantV1;
      readonly admin: CreatedCustomerAdminV1;
      readonly credential: NoCredentialV1<
        "existing_account" | "already_issued"
      >;
    };

export interface ResetAdminCredentialRequestV1 {
  readonly requestId: string;
  readonly tenantId: string;
  readonly userId: string;
}

export type ResetAdminCredentialResultV1 =
  | {
      readonly outcome: "reset";
      readonly tenantId: string;
      readonly userId: string;
      readonly credential: TemporaryPasswordCredentialV1;
    }
  | {
      readonly outcome: "replayed";
      readonly tenantId: string;
      readonly userId: string;
      readonly credential: NoCredentialV1<"already_issued">;
    };

export interface ListProvisionedTenantsRequestV1 {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ProvisionedTenantPageV1 {
  readonly tenants: readonly ProvisionedTenantV1[];
  readonly nextCursor: string | null;
}

/** At least one field must be present. */
export type UpdateProvisionedTenantRequestV1 =
  | {
      readonly displayName: string;
      readonly status?: ProvisionedTenantStatusV1;
    }
  | {
      readonly displayName?: string;
      readonly status: ProvisionedTenantStatusV1;
    };

/**
 * Browser broker on `OpsRabbitWorkspaceContext.tenantProvisioning`. Present only when the
 * manifest declares `capabilities.tenantProvisioning` and the workspace requests
 * `tenant.provisioning.manage` on a host that supports them. Every call is re-authorized by the
 * host against a live deployment-admin check, and only tenants this plugin provisioned are
 * visible; others are indistinguishable from unknown ids (`not_found`).
 */
export interface PluginTenantProvisioningServiceV1 {
  getAuthority(): Promise<TenantProvisioningAuthorityV1>;
  /**
   * Creates the tenant, its first admin, the admin membership, and tenant enablement of the
   * calling plugin in one host transaction, and opens the tenant on this plugin's workspace.
   */
  createCustomer(
    request: CreateCustomerRequestV1,
  ): Promise<CreateCustomerResultV1>;
  /** Issues a new temporary password and revokes the previous one and its sessions. */
  resetAdminCredential(
    request: ResetAdminCredentialRequestV1,
  ): Promise<ResetAdminCredentialResultV1>;
  listTenants(
    request?: ListProvisionedTenantsRequestV1,
  ): Promise<ProvisionedTenantPageV1>;
  getTenant(tenantId: string): Promise<ProvisionedTenantV1>;
  updateTenant(
    tenantId: string,
    patch: UpdateProvisionedTenantRequestV1,
  ): Promise<ProvisionedTenantV1>;
  /** Requires `logo: true`. Uploads straight to host branding; retry overwrites. */
  uploadLogo(tenantId: string, file: Blob): Promise<ProvisionedTenantLogoV1>;
  /** Requires `logo: true`. Null when the tenant has no custom logo. */
  getLogo(tenantId: string): Promise<ProvisionedTenantLogoV1 | null>;
}

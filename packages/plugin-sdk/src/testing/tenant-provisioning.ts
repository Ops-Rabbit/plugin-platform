import type {
  CreateCustomerResultV1,
  PluginTenantProvisioningErrorV1,
  PluginTenantProvisioningServiceV1,
  ProvisionedTenantLogoV1,
  ProvisionedTenantV1,
  ResetAdminCredentialResultV1,
  TenantProvisioningErrorCodeV1,
} from "../contracts/tenant-provisioning.js";
import {
  TENANT_PROVISIONING_DEFAULT_PAGE_SIZE,
  TENANT_PROVISIONING_LOGO_MAX_BYTES,
} from "../contracts/tenant-provisioning.js";
import {
  parseCreateCustomerRequestV1,
  parseListProvisionedTenantsRequestV1,
  parseResetAdminCredentialRequestV1,
  parseUpdateProvisionedTenantRequestV1,
} from "../validation/tenant-provisioning.js";

export interface TestTenantProvisioningOptions {
  /** Result of `getAuthority`; non-admin callers get `forbidden` everywhere else. */
  deploymentAdmin?: boolean;
  /** Mirrors the manifest `logo` flag. */
  logo?: boolean;
  /** Home path the fake host assigns, normally `/apps/<navigation.moduleKey>`. */
  homePath?: string;
  /** Emails that already have an account; their credentials are never touched. */
  existingAccounts?: readonly string[];
}

interface FakeTenant {
  tenant: Omit<ProvisionedTenantV1, "admin" | "logo">;
  adminUserId: string;
  /** Whether provisioning this tenant created the admin account, as the host records it. */
  adminAccountCreated: boolean;
  logo: ProvisionedTenantLogoV1 | null;
  /** True for tenants another plugin provisioned: invisible to this one. */
  foreign: boolean;
}

interface FakeUser {
  userId: string;
  email: string;
  displayName: string;
  credentialGeneration: number;
  mustChange: boolean;
  tenantIds: Set<string>;
}

interface RetryRecord {
  fingerprint: string;
  // Credential-free result; replays derive from it.
  result: Record<string, unknown>;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function error(
  code: TenantProvisioningErrorCodeV1,
  status: number,
): PluginTenantProvisioningErrorV1 {
  return Object.assign(new Error(`Tenant provisioning failed: ${code}.`), {
    code,
    status,
  });
}

/** Malformed input fails like the host does: with `invalid_request`, not a raw SDK error. */
function checked<T>(parse: (value: unknown) => T, value: unknown): T {
  try {
    return parse(value);
  } catch {
    throw error("invalid_request", 400);
  }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}

/**
 * Deterministic in-memory stand-in for `context.tenantProvisioning`. It keeps the host's
 * retry, ownership, and credential rules: a temporary password exists only in the one result
 * that issued it, replays never carry one, and tenants of other plugins look unknown.
 * Authorization and atomicity remain host integration concerns.
 */
export function createTestTenantProvisioningService(
  options: TestTenantProvisioningOptions = {},
) {
  let deploymentAdmin = options.deploymentAdmin ?? true;
  const homePath = options.homePath ?? "/apps/customer_app";
  const tenants = new Map<string, FakeTenant>();
  const users = new Map<string, FakeUser>();
  const retries = new Map<string, RetryRecord>();
  let sequence = 0;
  const nextId = (prefix: string) =>
    `${prefix}-${String(++sequence).padStart(4, "0")}`;
  for (const email of options.existingAccounts ?? [])
    users.set(email.toLowerCase(), {
      userId: nextId("user"),
      email: email.toLowerCase(),
      displayName: email,
      credentialGeneration: 0,
      mustChange: false,
      tenantIds: new Set(),
    });

  const password = () => {
    const bytes = new Uint8Array(24);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join(
      "",
    );
  };
  const admin = () => {
    if (!deploymentAdmin) throw error("forbidden", 403);
  };
  const owned = (tenantId: string) => {
    const entry = tenants.get(tenantId);
    if (!entry || entry.foreign) throw error("not_found", 404);
    return entry;
  };
  const userByEmail = (email: string) =>
    [...users.values()].find((user) => user.email === email);
  const userById = (userId: string) =>
    [...users.values()].find((user) => user.userId === userId);
  const view = (entry: FakeTenant): ProvisionedTenantV1 => {
    const user = userById(entry.adminUserId);
    return structuredClone({
      ...entry.tenant,
      admin: user
        ? {
            userId: user.userId,
            email: user.email,
            displayName: user.displayName,
            account: entry.adminAccountCreated ? "created" : "existing",
            credentialState: !entry.adminAccountCreated
              ? "not_managed"
              : user.mustChange
                ? "pending_first_sign_in"
                : "active",
          }
        : null,
      logo: entry.logo,
    });
  };
  const retry = (
    key: string,
    fingerprint: string,
  ): Record<string, unknown> | undefined => {
    const record = retries.get(key);
    if (!record) return undefined;
    if (record.fingerprint !== fingerprint)
      throw error("request_conflict", 409);
    return record.result;
  };

  const service: PluginTenantProvisioningServiceV1 = {
    async getAuthority() {
      return { deploymentAdmin };
    },
    async createCustomer(input) {
      admin();
      const request = checked(parseCreateCustomerRequestV1, input);
      const email = request.admin.email.toLowerCase();
      const fingerprint = stable({
        ...request,
        requestId: undefined,
        admin: { ...request.admin, email },
      });
      const replay = retry(`create:${request.requestId}`, fingerprint);
      if (replay) {
        const entry = owned(String(replay.tenantId));
        const user = userById(entry.adminUserId)!;
        return {
          outcome: "replayed",
          tenant: view(entry),
          admin: {
            userId: user.userId,
            email: user.email,
            account: entry.adminAccountCreated ? "created" : "existing",
          },
          credential: {
            kind: "none",
            reason: entry.adminAccountCreated
              ? "already_issued"
              : "existing_account",
          },
        } satisfies CreateCustomerResultV1;
      }
      if (
        [...tenants.values()].some(
          (entry) => entry.tenant.slug === request.tenant.slug,
        )
      )
        throw error("slug_taken", 409);
      const tenantId = nextId("tenant");
      let user = userByEmail(email);
      let value: string | undefined;
      if (!user) {
        value = password();
        user = {
          userId: nextId("user"),
          email,
          displayName: request.admin.displayName,
          credentialGeneration: 1,
          mustChange: true,
          tenantIds: new Set(),
        };
        users.set(email, user);
      }
      user.tenantIds.add(tenantId);
      const entry: FakeTenant = {
        tenant: {
          id: tenantId,
          slug: request.tenant.slug,
          displayName: request.tenant.displayName,
          status: "active",
          homePath,
          createdAt: new Date(
            Date.UTC(2026, 0, 1, 0, 0, sequence),
          ).toISOString(),
        },
        adminUserId: user.userId,
        adminAccountCreated: value !== undefined,
        logo: null,
        foreign: false,
      };
      tenants.set(tenantId, entry);
      retries.set(`create:${request.requestId}`, {
        fingerprint,
        result: { tenantId },
      });
      return {
        outcome: "created",
        tenant: view(entry),
        admin: {
          userId: user.userId,
          email,
          account: value ? "created" : "existing",
        },
        credential: value
          ? { kind: "temporary_password", value }
          : { kind: "none", reason: "existing_account" },
      } satisfies CreateCustomerResultV1;
    },
    async resetAdminCredential(input) {
      admin();
      const request = checked(parseResetAdminCredentialRequestV1, input);
      const fingerprint = stable({
        tenantId: request.tenantId,
        userId: request.userId,
      });
      const replay = retry(`reset:${request.requestId}`, fingerprint);
      if (replay)
        return {
          outcome: "replayed",
          tenantId: request.tenantId,
          userId: request.userId,
          credential: { kind: "none", reason: "already_issued" },
        } satisfies ResetAdminCredentialResultV1;
      const entry = owned(request.tenantId);
      const user = userById(request.userId);
      const shared =
        user !== undefined &&
        [...user.tenantIds].some(
          (tenantId) => tenants.get(tenantId)?.foreign !== false,
        );
      if (
        !user ||
        entry.adminUserId !== user.userId ||
        !entry.adminAccountCreated ||
        shared
      )
        throw error("credential_not_resettable", 409);
      user.credentialGeneration += 1;
      user.mustChange = true;
      retries.set(`reset:${request.requestId}`, { fingerprint, result: {} });
      return {
        outcome: "reset",
        tenantId: request.tenantId,
        userId: request.userId,
        credential: { kind: "temporary_password", value: password() },
      } satisfies ResetAdminCredentialResultV1;
    },
    async listTenants(input = {}) {
      admin();
      const request = checked(parseListProvisionedTenantsRequestV1, input);
      const visible = [...tenants.values()].filter((entry) => !entry.foreign);
      // Cursors are opaque to plugins; this fake issues `c<offset>` and rejects anything else.
      const offset = request.cursor
        ? /^c([0-9]{1,6})$/u.exec(request.cursor)?.[1]
        : "0";
      if (offset === undefined) throw error("invalid_request", 400);
      const start = Number(offset);
      const limit = request.limit ?? TENANT_PROVISIONING_DEFAULT_PAGE_SIZE;
      const page = visible.slice(start, start + limit);
      return {
        tenants: page.map(view),
        nextCursor: start + limit < visible.length ? `c${start + limit}` : null,
      };
    },
    async getTenant(tenantId) {
      admin();
      return view(owned(tenantId));
    },
    async updateTenant(tenantId, input) {
      admin();
      const patch = checked(parseUpdateProvisionedTenantRequestV1, input);
      const entry = owned(tenantId);
      entry.tenant = { ...entry.tenant, ...patch };
      return view(entry);
    },
    async uploadLogo(tenantId, file) {
      admin();
      if (!options.logo) throw error("not_available", 404);
      const entry = owned(tenantId);
      if (file.size > TENANT_PROVISIONING_LOGO_MAX_BYTES)
        throw error("logo_too_large", 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mimeType =
        bytes[0] === 0x89 && bytes[1] === 0x50
          ? "image/png"
          : bytes[0] === 0xff && bytes[1] === 0xd8
            ? "image/jpeg"
            : bytes[8] === 0x57 && bytes[9] === 0x45
              ? "image/webp"
              : undefined;
      if (!mimeType || bytes.length === 0) throw error("logo_invalid", 400);
      const digest = new Uint8Array(
        await globalThis.crypto.subtle.digest("SHA-256", bytes),
      );
      const version = (entry.logo?.version ?? 0) + 1;
      entry.logo = {
        url: `/branding/logo?tenant_id=${tenantId}&v=${version}`,
        mimeType,
        sizeBytes: bytes.length,
        sha256: Array.from(digest, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join(""),
        version,
      };
      return structuredClone(entry.logo);
    },
    async getLogo(tenantId) {
      admin();
      if (!options.logo) throw error("not_available", 404);
      return structuredClone(owned(tenantId).logo);
    },
  };

  return {
    service,
    setDeploymentAdmin(value: boolean) {
      deploymentAdmin = value;
    },
    /** Simulates the admin's first sign-in password change. */
    completeFirstSignIn(userId: string) {
      const user = userById(userId);
      if (user) user.mustChange = false;
    },
    /** Adds a tenant owned by a different plugin, optionally sharing an existing account. */
    addForeignTenant(input: { slug: string; adminEmail?: string }) {
      const tenantId = nextId("tenant");
      const user = input.adminEmail
        ? userByEmail(input.adminEmail.toLowerCase())
        : undefined;
      user?.tenantIds.add(tenantId);
      tenants.set(tenantId, {
        tenant: {
          id: tenantId,
          slug: input.slug,
          displayName: input.slug,
          status: "active",
          homePath: "/apps/other_plugin",
          createdAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
        },
        adminUserId: user?.userId ?? "",
        adminAccountCreated: false,
        logo: null,
        foreign: true,
      });
      return tenantId;
    },
    /** Serializable fake host state, for asserting that no credential value is retained. */
    snapshot() {
      return JSON.stringify({
        tenants: [...tenants.entries()],
        users: [...users.values()].map((user) => ({
          ...user,
          tenantIds: [...user.tenantIds],
        })),
        retries: [...retries.entries()],
      });
    },
  };
}

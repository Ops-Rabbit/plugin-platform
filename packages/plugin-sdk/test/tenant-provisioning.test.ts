import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  PLUGIN_FRONTEND_CAPABILITIES,
  PluginValidationError,
  TENANT_PROVISIONING_FRONTEND_CAPABILITY,
  TENANT_PROVISIONING_LOGO_MAX_BYTES,
  TENANT_PROVISIONING_MAX_PAGE_SIZE,
  TENANT_PROVISIONING_REQUEST_SCHEMA,
  TENANT_PROVISIONING_RESULT_SCHEMA,
  parseCreateCustomerRequestV1,
  parseCreateCustomerResultV1,
  parseListProvisionedTenantsRequestV1,
  parseProvisionedTenantV1,
  validateCreateCustomerRequestV1,
  validateCreateCustomerResultV1,
  validateListProvisionedTenantsRequestV1,
  validateManifest,
  validateProvisionedTenantLogoV1,
  validateProvisionedTenantPageV1,
  validateResetAdminCredentialRequestV1,
  validateResetAdminCredentialResultV1,
  validateUpdateProvisionedTenantRequestV1,
} from "../src/index.js";
import { createTestTenantProvisioningService } from "../src/testing/index.js";

async function schemaFile(name: string) {
  return JSON.parse(
    await readFile(resolve(import.meta.dirname, `../schemas/${name}`), "utf8"),
  );
}

function ajv() {
  return new Ajv2020({ allErrors: true, strict: true });
}

function provisioningManifest(
  overrides: Record<string, unknown> = {},
  capabilities: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "onboarding",
    name: "Onboarding",
    version: "1.0.0",
    description: "Customer onboarding",
    apiVersion: "1.0",
    main: "./dist/index.js",
    minimumOpsRabbitVersion: "0.12.0",
    navigation: {
      kind: "plugin_workspace",
      moduleKey: "customer_app",
      path: "/apps/customer_app",
      icon: "alert_triangle",
      fallbackTitle: "Customers",
    },
    frontend: {
      kind: "native_workspace",
      entry: "./dist/frontend.js",
      styles: [],
      assets: [],
      sdkVersion: "1",
      mountIsolation: "shadow_dom",
      capabilities: ["tenant.provisioning.manage"],
    },
    capabilities: {
      tenantProvisioning: { schemaVersion: "1", logo: true },
      ...capabilities,
    },
    ...overrides,
  };
}

const base = provisioningManifest();
const frontend = base.frontend as Record<string, unknown>;
const navigation = base.navigation as Record<string, unknown>;
const actionsOnly = {
  actions: [{ id: "list_records", risk: "read", requiredRole: "viewer" }],
};

const rejected: Array<{ name: string; manifest: Record<string, unknown> }> = [
  {
    name: "unknown schema version",
    manifest: provisioningManifest(
      {},
      { tenantProvisioning: { schemaVersion: "2" } },
    ),
  },
  {
    name: "non-boolean logo flag",
    manifest: provisioningManifest(
      {},
      { tenantProvisioning: { schemaVersion: "1", logo: "yes" } },
    ),
  },
  {
    name: "unknown declaration field",
    manifest: provisioningManifest(
      {},
      { tenantProvisioning: { schemaVersion: "1", homeModuleKey: "other" } },
    ),
  },
  {
    name: "host older than 0.12.0",
    manifest: provisioningManifest({ minimumOpsRabbitVersion: "0.11.9" }),
  },
  {
    name: "pre-release of 0.12.0",
    manifest: provisioningManifest({ minimumOpsRabbitVersion: "0.12.0-rc.1" }),
  },
  {
    name: "missing minimum host version",
    manifest: provisioningManifest({ minimumOpsRabbitVersion: undefined }),
  },
  {
    name: "capability without the frontend capability",
    manifest: provisioningManifest(
      {
        frontend: {
          ...frontend,
          capabilities: ["plugin.actions.invoke"],
          actionIds: ["list_records"],
        },
      },
      actionsOnly,
    ),
  },
  {
    name: "frontend capability without the capability",
    manifest: provisioningManifest({
      capabilities: actionsOnly,
      frontend: {
        ...frontend,
        capabilities: ["plugin.actions.invoke", "tenant.provisioning.manage"],
        actionIds: ["list_records"],
      },
    }),
  },
  {
    name: "capability without a native frontend",
    manifest: provisioningManifest({
      frontend: undefined,
      navigation: undefined,
    }),
  },
  {
    name: "admin-only workspace navigation",
    manifest: provisioningManifest({
      navigation: { ...navigation, adminOnly: true },
    }),
  },
  {
    name: "Forms workspace navigation",
    manifest: provisioningManifest({
      navigation: { ...navigation, kind: "forms_workspace" },
      formStarterPack: {
        moduleKey: "customer_app",
        path: "./forms/customers.json",
      },
    }),
  },
];

function strip(manifest: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
}

describe("tenantProvisioning manifest capability", () => {
  it("publishes the frontend capability constant", () => {
    expect(PLUGIN_FRONTEND_CAPABILITIES).toContain(
      TENANT_PROVISIONING_FRONTEND_CAPABILITY,
    );
  });

  it("accepts the declaration on a standalone native workspace", () => {
    expect(validateManifest(base)).toEqual({
      ok: true,
      value: base,
      issues: [],
    });
    const withoutLogo = provisioningManifest(
      {},
      { tenantProvisioning: { schemaVersion: "1" } },
    );
    expect(validateManifest(withoutLogo).ok).toBe(true);
    expect(
      validateManifest(
        provisioningManifest({ minimumOpsRabbitVersion: "1.0.0" }),
      ).ok,
    ).toBe(true);
    expect(
      validateManifest(
        provisioningManifest({
          navigation: { ...navigation, adminOnly: false },
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects malformed, unsupported, and unreachable declarations", () => {
    for (const { name, manifest } of rejected)
      expect(validateManifest(strip(manifest)).ok, name).toBe(false);
    expect(
      validateManifest(
        provisioningManifest({ minimumOpsRabbitVersion: "0.11.9" }),
      ).issues.map((entry) => entry.message),
    ).toContain(
      "capabilities.tenantProvisioning requires minimumOpsRabbitVersion 0.12.0 or later.",
    );
    expect(
      validateManifest(
        provisioningManifest({
          navigation: { ...navigation, kind: "forms_workspace" },
          formStarterPack: {
            moduleKey: "customer_app",
            path: "./forms/customers.json",
          },
        }),
      ).issues,
    ).toEqual([
      expect.objectContaining({
        path: "$.navigation.kind",
        message:
          "tenantProvisioning opens new tenants on a standalone plugin_workspace.",
      }),
    ]);
  });

  it("leaves manifests without the capability unchanged", () => {
    const manifest = provisioningManifest({
      minimumOpsRabbitVersion: "0.8.0",
      capabilities: actionsOnly,
      frontend: {
        ...frontend,
        capabilities: ["plugin.actions.invoke"],
        actionIds: ["list_records"],
      },
    });
    expect(validateManifest(manifest).ok).toBe(true);
  });

  it("matches the published manifest JSON Schema", async () => {
    const validate = ajv().compile(
      await schemaFile("opsrabbit-plugin.schema.json"),
    );
    expect(validate(base)).toBe(true);
    for (const { name, manifest } of rejected)
      expect(Boolean(validate(strip(manifest))), name).toBe(false);
  });
});

const tenant = {
  id: "tenant-1",
  slug: "acme",
  displayName: "Acme",
  status: "active",
  homePath: "/apps/customer_app",
  createdAt: "2026-10-24T10:00:00.000Z",
  admin: {
    userId: "user-1",
    email: "owner@acme.test",
    displayName: "Owner",
    account: "created",
    credentialState: "pending_first_sign_in",
  },
  logo: null,
};
const createRequest = {
  requestId: "request-0000000001",
  tenant: { slug: "acme", displayName: "Acme" },
  admin: { email: "owner@acme.test", displayName: "Owner" },
};
const temporaryPassword = {
  kind: "temporary_password",
  value: "Abcdefghjkmnpqrstuvwx234",
};
const createdAdmin = {
  userId: "user-1",
  email: "owner@acme.test",
  account: "created",
};

describe("tenant provisioning requests", () => {
  const cases: Array<{ name: string; value: unknown; valid: boolean }> = [
    { name: "valid", value: createRequest, valid: true },
    {
      name: "short request id",
      value: { ...createRequest, requestId: "short" },
      valid: false,
    },
    {
      name: "non-canonical slug",
      value: {
        ...createRequest,
        tenant: { slug: "Acme Corp", displayName: "Acme" },
      },
      valid: false,
    },
    {
      name: "double dash slug",
      value: {
        ...createRequest,
        tenant: { slug: "ac--me", displayName: "Acme" },
      },
      valid: false,
    },
    {
      name: "one character slug",
      value: { ...createRequest, tenant: { slug: "a", displayName: "Acme" } },
      valid: false,
    },
    {
      name: "untrimmed display name",
      value: {
        ...createRequest,
        tenant: { slug: "acme", displayName: " Acme" },
      },
      valid: false,
    },
    {
      name: "overlong display name",
      value: {
        ...createRequest,
        tenant: { slug: "acme", displayName: "x".repeat(161) },
      },
      valid: false,
    },
    {
      name: "display name with accents, inner spaces and emoji",
      value: {
        ...createRequest,
        tenant: {
          slug: "acme",
          displayName: `Ac${String.fromCodePoint(0xe9)}me ${String.fromCodePoint(0x1f600)} Ltd`,
        },
      },
      valid: true,
    },
    ...[
      ["line break", 0x0a],
      ["NUL", 0x00],
      ["C1 control", 0x85],
      ["right-to-left override", 0x202e],
      ["right-to-left isolate", 0x2067],
      ["zero-width space", 0x200b],
      ["byte order mark", 0xfeff],
      ["unpaired surrogate", 0xd800],
    ].map(([label, code]) => ({
      name: `display name with a ${label}`,
      value: {
        ...createRequest,
        admin: {
          email: "owner@acme.test",
          displayName: `Ow${String.fromCharCode(code as number)}ner`,
        },
      },
      valid: false,
    })),
    {
      name: "invalid email",
      value: {
        ...createRequest,
        admin: { email: "owner", displayName: "Owner" },
      },
      valid: false,
    },
    {
      name: "password at the top level",
      value: { ...createRequest, password: "Chosen-by-admin-123" },
      valid: false,
    },
    {
      name: "password on the admin",
      value: {
        ...createRequest,
        admin: { ...createRequest.admin, password: "Chosen-by-admin-123" },
      },
      valid: false,
    },
  ];

  it("validates createCustomer requests the same way as the published schema", () => {
    const compiled = ajv();
    compiled.addSchema(TENANT_PROVISIONING_REQUEST_SCHEMA);
    const validate = compiled.getSchema(
      `${TENANT_PROVISIONING_REQUEST_SCHEMA.$id}#/$defs/createCustomer`,
    )!;
    for (const { name, value, valid } of cases) {
      expect(validateCreateCustomerRequestV1(value).length === 0, name).toBe(
        valid,
      );
      expect(Boolean(validate(value)), name).toBe(valid);
    }
  });

  it("bounds reset, list, and update requests", () => {
    expect(
      validateResetAdminCredentialRequestV1({
        requestId: "request-0000000002",
        tenantId: "tenant-1",
        userId: "user-1",
      }),
    ).toEqual([]);
    expect(
      validateResetAdminCredentialRequestV1({
        requestId: "request-0000000002",
        tenantId: "tenant-1",
      }),
    ).not.toEqual([]);
    expect(validateListProvisionedTenantsRequestV1({})).toEqual([]);
    // The request is optional on listTenants, so omitting it is the first default page.
    expect(validateListProvisionedTenantsRequestV1(undefined)).toEqual([]);
    expect(parseListProvisionedTenantsRequestV1(undefined)).toEqual({});
    expect(validateListProvisionedTenantsRequestV1("page")).not.toEqual([]);
    expect(
      validateListProvisionedTenantsRequestV1({
        limit: TENANT_PROVISIONING_MAX_PAGE_SIZE,
      }),
    ).toEqual([]);
    expect(
      validateListProvisionedTenantsRequestV1({
        limit: TENANT_PROVISIONING_MAX_PAGE_SIZE + 1,
      }),
    ).not.toEqual([]);
    expect(
      validateListProvisionedTenantsRequestV1({ cursor: "bad cursor" }),
    ).not.toEqual([]);
    expect(
      validateUpdateProvisionedTenantRequestV1({ status: "disabled" }),
    ).toEqual([]);
    expect(validateUpdateProvisionedTenantRequestV1({})).not.toEqual([]);
    expect(
      validateUpdateProvisionedTenantRequestV1({ status: "deleted" }),
    ).not.toEqual([]);
    expect(
      validateUpdateProvisionedTenantRequestV1({ slug: "renamed" }),
    ).not.toEqual([]);
  });

  it("parses into frozen copies and rejects accessors and class instances", () => {
    const parsed = parseCreateCustomerRequestV1(createRequest);
    expect(parsed).toEqual(createRequest);
    expect(parsed).not.toBe(createRequest);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.admin)).toBe(true);
    const accessor = {
      ...createRequest,
      get requestId() {
        return "request-0000000001";
      },
    };
    expect(() => parseCreateCustomerRequestV1(accessor)).toThrow(
      PluginValidationError,
    );
    expect(validateCreateCustomerRequestV1(new Map())).not.toEqual([]);
  });
});

describe("tenant provisioning results", () => {
  it("publishes request and result schemas identical to the runtime constants", async () => {
    expect(
      await schemaFile("opsrabbit-tenant-provisioning-request.schema.json"),
    ).toEqual(TENANT_PROVISIONING_REQUEST_SCHEMA);
    expect(
      await schemaFile("opsrabbit-tenant-provisioning-result.schema.json"),
    ).toEqual(TENANT_PROVISIONING_RESULT_SCHEMA);
  });

  const createResults: Array<{ name: string; value: unknown; valid: boolean }> =
    [
      {
        name: "created with temporary password",
        value: {
          outcome: "created",
          tenant,
          admin: createdAdmin,
          credential: temporaryPassword,
        },
        valid: true,
      },
      {
        name: "created for existing account",
        value: {
          outcome: "created",
          tenant,
          admin: { ...createdAdmin, account: "existing" },
          credential: { kind: "none", reason: "existing_account" },
        },
        valid: true,
      },
      {
        name: "replayed without credential",
        value: {
          outcome: "replayed",
          tenant,
          admin: createdAdmin,
          credential: { kind: "none", reason: "already_issued" },
        },
        valid: true,
      },
      {
        name: "replayed carrying a temporary password",
        value: {
          outcome: "replayed",
          tenant,
          admin: createdAdmin,
          credential: temporaryPassword,
        },
        valid: false,
      },
      {
        name: "created claiming already issued",
        value: {
          outcome: "created",
          tenant,
          admin: createdAdmin,
          credential: { kind: "none", reason: "already_issued" },
        },
        valid: false,
      },
      {
        name: "short temporary password",
        value: {
          outcome: "created",
          tenant,
          admin: createdAdmin,
          credential: { kind: "temporary_password", value: "short" },
        },
        valid: false,
      },
      {
        name: "unknown outcome",
        value: {
          outcome: "updated",
          tenant,
          admin: createdAdmin,
          credential: temporaryPassword,
        },
        valid: false,
      },
      {
        name: "home path outside plugin workspaces",
        value: {
          outcome: "created",
          tenant: { ...tenant, homePath: "/settings" },
          admin: createdAdmin,
          credential: temporaryPassword,
        },
        valid: false,
      },
    ];

  it("never accepts a credential on a replay, matching the published schema", () => {
    const compiled = ajv();
    compiled.addSchema(TENANT_PROVISIONING_RESULT_SCHEMA);
    const validate = compiled.getSchema(
      `${TENANT_PROVISIONING_RESULT_SCHEMA.$id}#/$defs/createCustomer`,
    )!;
    for (const { name, value, valid } of createResults) {
      expect(validateCreateCustomerResultV1(value).length === 0, name).toBe(
        valid,
      );
      expect(Boolean(validate(value)), name).toBe(valid);
    }
    expect(() =>
      parseCreateCustomerResultV1({
        outcome: "replayed",
        tenant,
        admin: createdAdmin,
        credential: temporaryPassword,
      }),
    ).toThrow(PluginValidationError);
  });

  it("does not echo a rejected credential value in validation errors", () => {
    const value = "Secret-Value-That-Must-Not-Leak";
    try {
      parseCreateCustomerResultV1({
        outcome: "replayed",
        tenant,
        admin: createdAdmin,
        credential: { kind: "temporary_password", value },
      });
      expect.unreachable();
    } catch (error) {
      expect(
        JSON.stringify((error as PluginValidationError).issues),
      ).not.toContain(value);
      expect(String(error)).not.toContain(value);
    }
  });

  it("validates reset results, tenants, pages, and logos", () => {
    expect(
      validateResetAdminCredentialResultV1({
        outcome: "reset",
        tenantId: "tenant-1",
        userId: "user-1",
        credential: temporaryPassword,
      }),
    ).toEqual([]);
    expect(
      validateResetAdminCredentialResultV1({
        outcome: "replayed",
        tenantId: "tenant-1",
        userId: "user-1",
        credential: temporaryPassword,
      }),
    ).not.toEqual([]);
    expect(parseProvisionedTenantV1({ ...tenant, admin: null })).toMatchObject({
      admin: null,
    });
    expect(
      validateProvisionedTenantPageV1({ tenants: [tenant], nextCursor: "c1" }),
    ).toEqual([]);
    expect(validateProvisionedTenantPageV1({ tenants: [tenant] })).not.toEqual(
      [],
    );
    const logo = {
      url: "/api/configuration/branding/logo?tenant_id=tenant-1&v=1",
      mimeType: "image/png",
      sizeBytes: 10,
      sha256: "a".repeat(64),
      version: 1,
    };
    expect(validateProvisionedTenantLogoV1(logo)).toEqual([]);
    expect(
      validateProvisionedTenantLogoV1({ ...logo, url: "//evil.test/logo" }),
    ).not.toEqual([]);
    expect(
      validateProvisionedTenantLogoV1({
        ...logo,
        url: "https://api.example.test:8384/configuration/branding/logo?v=1",
      }),
    ).toEqual([]);
    expect(
      validateProvisionedTenantLogoV1({ ...logo, url: "javascript:alert(1)" }),
    ).not.toEqual([]);
    expect(
      validateProvisionedTenantLogoV1({
        ...logo,
        url: "https://evil.test//logo",
      }),
    ).not.toEqual([]);
    expect(
      validateProvisionedTenantLogoV1({ ...logo, mimeType: "image/svg+xml" }),
    ).not.toEqual([]);
    expect(
      validateProvisionedTenantLogoV1({
        ...logo,
        sizeBytes: TENANT_PROVISIONING_LOGO_MAX_BYTES + 1,
      }),
    ).not.toEqual([]);
  });
});

describe("createTestTenantProvisioningService", () => {
  const png = () =>
    new Blob(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      {
        type: "image/png",
      },
    );

  it("issues a temporary password once and replays without one", async () => {
    const fake = createTestTenantProvisioningService();
    const created = await fake.service.createCustomer(createRequest);
    expect(validateCreateCustomerResultV1(created)).toEqual([]);
    expect(created.credential.kind).toBe("temporary_password");
    const value =
      created.credential.kind === "temporary_password"
        ? created.credential.value
        : "";
    expect(fake.snapshot()).not.toContain(value);
    const replayed = await fake.service.createCustomer(createRequest);
    expect(replayed).toMatchObject({
      outcome: "replayed",
      credential: { kind: "none", reason: "already_issued" },
    });
    expect(JSON.stringify(replayed)).not.toContain(value);
    await expect(
      fake.service.createCustomer({
        ...createRequest,
        tenant: { slug: "acme-two", displayName: "Acme" },
      }),
    ).rejects.toMatchObject({ code: "request_conflict" });
  });

  it("keeps existing accounts' display names within the contract", async () => {
    const email = `${"o".repeat(64)}@${"a".repeat(63)}.${"b".repeat(63)}.test`;
    const fake = createTestTenantProvisioningService({
      existingAccounts: [email],
    });
    const created = await fake.service.createCustomer({
      ...createRequest,
      admin: { email, displayName: "Owner" },
    });
    expect(validateCreateCustomerResultV1(created)).toEqual([]);
  });

  it("never issues a credential for an existing account", async () => {
    const fake = createTestTenantProvisioningService({
      existingAccounts: ["Owner@Acme.test"],
    });
    const created = await fake.service.createCustomer(createRequest);
    expect(created.credential).toEqual({
      kind: "none",
      reason: "existing_account",
    });
    expect(created.tenant.admin?.credentialState).toBe("not_managed");
    await expect(
      fake.service.resetAdminCredential({
        requestId: "reset-000000000001",
        tenantId: created.tenant.id,
        userId: created.admin.userId,
      }),
    ).rejects.toMatchObject({ code: "credential_not_resettable" });
  });

  it("resets only accounts it created and replays resets without a credential", async () => {
    const fake = createTestTenantProvisioningService();
    const created = await fake.service.createCustomer(createRequest);
    fake.completeFirstSignIn(created.admin.userId);
    expect(
      (await fake.service.getTenant(created.tenant.id)).admin?.credentialState,
    ).toBe("active");
    const request = {
      requestId: "reset-000000000001",
      tenantId: created.tenant.id,
      userId: created.admin.userId,
    };
    const reset = await fake.service.resetAdminCredential(request);
    expect(reset.outcome).toBe("reset");
    expect(
      (await fake.service.getTenant(created.tenant.id)).admin?.credentialState,
    ).toBe("pending_first_sign_in");
    expect(await fake.service.resetAdminCredential(request)).toMatchObject({
      outcome: "replayed",
      credential: { kind: "none", reason: "already_issued" },
    });
    fake.addForeignTenant({ slug: "elsewhere", adminEmail: "owner@acme.test" });
    await expect(
      fake.service.resetAdminCredential({
        ...request,
        requestId: "reset-000000000002",
      }),
    ).rejects.toMatchObject({ code: "credential_not_resettable" });
  });

  it("hides tenants of other plugins and denies non-admins", async () => {
    const fake = createTestTenantProvisioningService({ logo: true });
    const foreign = fake.addForeignTenant({ slug: "other" });
    await expect(fake.service.getTenant(foreign)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      fake.service.updateTenant(foreign, { status: "disabled" }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(fake.service.uploadLogo(foreign, png())).rejects.toMatchObject(
      { code: "not_found" },
    );
    expect((await fake.service.listTenants()).tenants).toEqual([]);
    fake.setDeploymentAdmin(false);
    expect(await fake.service.getAuthority()).toEqual({
      deploymentAdmin: false,
    });
    await expect(
      fake.service.createCustomer(createRequest),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("pages, updates, and stores logos it can read back", async () => {
    const fake = createTestTenantProvisioningService({ logo: true });
    for (const index of [1, 2, 3])
      await fake.service.createCustomer({
        requestId: `request-000000000${index}0`,
        tenant: { slug: `acme-${index}`, displayName: `Acme ${index}` },
        admin: { email: `owner${index}@acme.test`, displayName: "Owner" },
      });
    const first = await fake.service.listTenants({ limit: 2 });
    expect(first.tenants).toHaveLength(2);
    const second = await fake.service.listTenants({
      cursor: first.nextCursor!,
      limit: 2,
    });
    expect(second).toMatchObject({ nextCursor: null });
    const id = first.tenants[0]!.id;
    expect(
      await fake.service.updateTenant(id, { displayName: "Renamed" }),
    ).toMatchObject({
      displayName: "Renamed",
    });
    expect(await fake.service.getLogo(id)).toBeNull();
    const logo = await fake.service.uploadLogo(id, png());
    expect(validateProvisionedTenantLogoV1(logo)).toEqual([]);
    expect(await fake.service.getLogo(id)).toEqual(logo);
    await expect(
      fake.service.uploadLogo(id, new Blob(["GIF89a"])),
    ).rejects.toMatchObject({
      code: "logo_invalid",
    });
    // Like the host, the fake reads the bytes: the declared type is ignored and partial
    // signatures, such as "WE" at byte 8 without RIFF/WEBP, are rejected.
    expect(
      (
        await fake.service.uploadLogo(
          id,
          new Blob([await png().arrayBuffer()], { type: "" }),
        )
      ).mimeType,
    ).toBe("image/png");
    const webp = new Uint8Array(12);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect((await fake.service.uploadLogo(id, new Blob([webp]))).mimeType).toBe(
      "image/webp",
    );
    const looseWebp = new Uint8Array(12);
    looseWebp.set([0x57, 0x45], 8);
    for (const bytes of [
      looseWebp,
      new Uint8Array(0),
      new Uint8Array([0x89, 0x50]),
    ])
      await expect(
        fake.service.uploadLogo(id, new Blob([bytes], { type: "image/png" })),
      ).rejects.toMatchObject({ code: "logo_invalid" });
    await expect(
      createTestTenantProvisioningService().service.getLogo(id),
    ).rejects.toMatchObject({ code: "not_available" });
  });
});

describe("tenant provisioning hardening", () => {
  const smuggledReplay = `{"outcome":"replayed","tenant":${JSON.stringify(tenant)},"admin":${JSON.stringify(createdAdmin)},"credential":{"kind":"none","reason":"already_issued","__proto__":{"value":"Smuggled-Secret-123"}}}`;

  it("rejects __proto__ keys instead of letting them hide data from validation", () => {
    const replay = JSON.parse(smuggledReplay);
    expect(validateCreateCustomerResultV1(replay)).not.toEqual([]);
    expect(() => parseCreateCustomerResultV1(replay)).toThrow(
      PluginValidationError,
    );
    const request = JSON.parse(
      `{"requestId":"request-0000000001","tenant":{"slug":"acme","displayName":"Acme"},"admin":{"email":"owner@acme.test","displayName":"Owner","__proto__":{"password":"Chosen-By-Admin-1"}}}`,
    );
    expect(validateCreateCustomerRequestV1(request)).not.toEqual([]);
    expect(() => parseCreateCustomerRequestV1(request)).toThrow(
      PluginValidationError,
    );
  });

  it("treats optional fields set to undefined as absent", () => {
    expect(
      validateListProvisionedTenantsRequestV1({ cursor: undefined, limit: 5 }),
    ).toEqual([]);
    expect(
      validateUpdateProvisionedTenantRequestV1({
        displayName: undefined,
        status: "archived",
      }),
    ).toEqual([]);
    expect(
      validateUpdateProvisionedTenantRequestV1({ displayName: undefined }),
    ).not.toEqual([]);
    expect(
      validateCreateCustomerRequestV1({
        ...createRequest,
        requestId: undefined,
      }),
    ).not.toEqual([]);
  });

  it("rejects huge or sparse arrays without walking them", () => {
    const started = Date.now();
    const issues = validateProvisionedTenantPageV1({
      tenants: new Array(2 ** 32 - 1),
      nextCursor: null,
    });
    expect(issues).not.toEqual([]);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("keeps the fake's answers consistent when an email is reused across tenants", async () => {
    const fake = createTestTenantProvisioningService();
    const first = await fake.service.createCustomer(createRequest);
    const secondRequest = {
      requestId: "request-0000000099",
      tenant: { slug: "acme-two", displayName: "Acme Two" },
      admin: createRequest.admin,
    };
    const second = await fake.service.createCustomer(secondRequest);
    expect(second.admin).toMatchObject({
      userId: first.admin.userId,
      account: "existing",
    });
    expect(second.credential).toEqual({
      kind: "none",
      reason: "existing_account",
    });
    expect(second.tenant.admin).toMatchObject({
      account: "existing",
      credentialState: "not_managed",
    });
    expect(first.tenant.admin).toMatchObject({ account: "created" });
    const replay = await fake.service.createCustomer(secondRequest);
    expect(replay).toMatchObject({
      outcome: "replayed",
      admin: { account: "existing" },
      credential: { kind: "none", reason: "existing_account" },
    });
  });

  it("rejects cursors the fake did not issue", async () => {
    const fake = createTestTenantProvisioningService();
    for (const cursor of ["zzz", "c-2", "c1.5"])
      await expect(fake.service.listTenants({ cursor })).rejects.toMatchObject({
        code: "invalid_request",
      });
  });
});

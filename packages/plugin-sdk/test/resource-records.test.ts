import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  PLUGIN_SOURCE_INBOUND_BINDING_SCHEMA,
  PLUGIN_RESOURCE_TRANSACTION_SCHEMA,
  validatePluginSourceInboundBinding,
  validatePluginResourceTransaction,
  PLUGIN_RESOURCE_QUERY_SCHEMA,
  PLUGIN_RESOURCE_REGISTRATION_SCHEMA,
  PLUGIN_RESOURCE_DELETION_SCHEMA,
  PLUGIN_RESOURCE_CAPABILITY_SCHEMA,
  validatePluginResourceQuery,
  validatePluginResourceRegistration,
  validatePluginResourceDeletion,
  validatePluginResourceCapability,
  validateManifest,
  validateRegistration,
  type PluginManifest,
} from "../src/index.js";

export const resourceCapability = {
  schemaVersion: "1" as const,
  kinds: {
    incident: {
      labelKey: "incident.title",
      descriptionKey: "incident.description",
      retention: {
        defaultMode: "retain_indefinitely" as const,
        supportedModes: [
          "do_not_persist",
          "retain_for_days",
          "retain_indefinitely",
        ] as const,
      },
    },
  },
};
const query = {
  schemaVersion: "1",
  kind: "incident",
  tenantIds: ["tenant-a"],
  candidates: {
    sql: "select tenant_id,id as resource_id,display_title from incidents where severity=$1",
    parameters: ["high"],
  },
  orderBy: [{ column: "resource_id", direction: "desc" }],
  page: 1,
  pageSize: 25,
};
const registration = {
  kind: "incident",
  id: "incident-1",
  eligibleAt: "2026-10-16T00:00:00.000Z",
};
const deletion = {
  schemaVersion: "1",
  kind: "incident",
  ids: ["incident-1"],
  reason: "retention",
};
const ajv = new Ajv2020({ strict: true, validateFormats: false });
const contracts = [
  [
    "plugin-source-inbound-binding",
    PLUGIN_SOURCE_INBOUND_BINDING_SCHEMA,
    validatePluginSourceInboundBinding,
    { inboundId: "inbound-1", kind: "incident", enabled: false },
  ],
  [
    "plugin-resource-transaction",
    PLUGIN_RESOURCE_TRANSACTION_SCHEMA,
    validatePluginResourceTransaction,
    {
      kind: "incident",
      purpose: "records",
      operation: "create",
      ids: ["incident-1"],
    },
  ],
  [
    "plugin-resource-query",
    PLUGIN_RESOURCE_QUERY_SCHEMA,
    validatePluginResourceQuery,
    query,
  ],
  [
    "plugin-resource-registration",
    PLUGIN_RESOURCE_REGISTRATION_SCHEMA,
    validatePluginResourceRegistration,
    registration,
  ],
  [
    "plugin-resource-deletion",
    PLUGIN_RESOURCE_DELETION_SCHEMA,
    validatePluginResourceDeletion,
    deletion,
  ],
  [
    "plugin-resource-capability",
    PLUGIN_RESOURCE_CAPABILITY_SCHEMA,
    validatePluginResourceCapability,
    resourceCapability,
  ],
] as const;

describe("plugin resource contracts", () => {
  for (const [name, schema, validate, valid] of contracts) {
    const schemaValidate = ajv.compile(schema);
    it(`${name} ships the runtime schema and accepts a complete contract`, () => {
      expect(
        JSON.parse(
          readFileSync(
            new URL(
              `../schemas/opsrabbit-${name}.schema.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      ).toEqual(schema);
      expect(validate(valid)).toEqual([]);
      expect(schemaValidate(valid)).toBe(true);
    });
    for (const value of [
      undefined,
      null,
      false,
      0,
      "invalid",
      [],
      {},
      { ...valid, extra: "untrusted" },
    ]) {
      it(`${name} rejects malformed input ${JSON.stringify(value)}`, () => {
        expect(validate(value).length).toBeGreaterThan(0);
        expect(schemaValidate(value)).toBe(false);
      });
    }
    it(`${name} does not accept inherited required fields`, () => {
      expect(validate(Object.create(valid)).length).toBeGreaterThan(0);
    });
  }

  it.each([
    { page: 0 },
    { page: 10001 },
    { page: 1.5 },
    { page: Number.NaN },
    { pageSize: 101 },
    { tenantIds: [] },
    { tenantIds: ["tenant-a", "tenant-a"] },
    { tenantIds: ["tenant-a\n"] },
    { tenantIds: Array.from({ length: 101 }, (_, n) => `tenant-${n}`) },
    { kind: "Incident" },
    { kind: "incident\n" },
    { candidates: { sql: "", parameters: [] } },
    { candidates: { sql: "select 1", parameters: [{}] } },
    { candidates: { sql: "select 1", parameters: [Number.POSITIVE_INFINITY] } },
    { candidates: { sql: "s".repeat(32769), parameters: [] } },
    { candidates: { sql: "select 1", parameters: Array(129).fill(null) } },
    { candidates: { sql: "select 1", parameters: ["x".repeat(32769)] } },
    { orderBy: [] },
    { orderBy: [{ column: "id;drop_table", direction: "asc" }] },
    { orderBy: [{ column: "id", direction: "random" }] },
    { groupBy: "tenant_id.desc" },
  ])("schema/runtime reject invalid query bounds: %j", (patch) => {
    const input = { ...query, ...patch };
    expect(validatePluginResourceQuery(input).length).toBeGreaterThan(0);
    expect(ajv.getSchema(PLUGIN_RESOURCE_QUERY_SCHEMA.$id)!(input)).toBe(false);
  });

  it("rejects non-boolean binding flags and ambiguous transaction purposes", () => {
    expect(
      validatePluginSourceInboundBinding({
        inboundId: "inbound-1",
        kind: "incident",
        enabled: "yes",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validatePluginResourceTransaction({
        kind: "incident",
        purpose: "unrestricted",
      }).length,
    ).toBeGreaterThan(0);
  });
  it("accepts scalar parameters and bounded grouping without guessing authorization", () => {
    expect(
      validatePluginResourceQuery({
        ...query,
        candidates: { sql: "select 1", parameters: [null, true, 42, "high"] },
        groupBy: "severity",
      }),
    ).toEqual([]);
  });
  it.each([
    "2026-02-30T00:00:00.000Z",
    "1900-02-29T00:00:00.000Z",
    "2026-10-16",
    "2026-10-16T00:00:00.000Z\n",
  ])("rejects noncanonical eligibility clock %s", (eligibleAt) => {
    const value = { ...registration, eligibleAt };
    expect(validatePluginResourceRegistration(value).length).toBeGreaterThan(0);
    expect(ajv.getSchema(PLUGIN_RESOURCE_REGISTRATION_SCHEMA.$id)!(value)).toBe(
      false,
    );
  });
  it("accepts Gregorian century leap days", () => {
    expect(
      validatePluginResourceRegistration({
        ...registration,
        eligibleAt: "2000-02-29T00:00:00.000Z",
      }),
    ).toEqual([]);
  });
  it.each([
    { ids: [] },
    { ids: ["incident-1", "incident-1"] },
    { reason: "upstream_delete" },
    { ids: Array.from({ length: 101 }, (_, n) => `id-${n}`) },
  ])("rejects invalid deletion batches: %j", (patch) => {
    const value = { ...deletion, ...patch };
    expect(validatePluginResourceDeletion(value).length).toBeGreaterThan(0);
    expect(ajv.getSchema(PLUGIN_RESOURCE_DELETION_SCHEMA.$id)!(value)).toBe(
      false,
    );
  });
  it.each([
    { kinds: {} },
    { kinds: { "bad.kind": resourceCapability.kinds.incident } },
    {
      kinds: Object.fromEntries(
        Array.from({ length: 17 }, (_, n) => [
          `kind_${n}`,
          resourceCapability.kinds.incident,
        ]),
      ),
    },
    {
      kinds: {
        incident: {
          ...resourceCapability.kinds.incident,
          labelKey: "bad label",
        },
      },
    },
    {
      kinds: {
        incident: {
          ...resourceCapability.kinds.incident,
          retention: {
            defaultMode: "retain_for_days",
            supportedModes: ["retain_for_days"],
          },
        },
      },
    },
    {
      kinds: {
        incident: {
          ...resourceCapability.kinds.incident,
          retention: {
            defaultMode: "retain_indefinitely",
            supportedModes: [
              "retain_indefinitely",
              "retain_indefinitely",
              "retain_indefinitely",
            ],
          },
        },
      },
    },
  ])("rejects unsafe/destructive capability defaults: %j", (patch) => {
    const value = { ...resourceCapability, ...patch };
    expect(validatePluginResourceCapability(value).length).toBeGreaterThan(0);
    expect(ajv.getSchema(PLUGIN_RESOURCE_CAPABILITY_SCHEMA.$id)!(value)).toBe(
      false,
    );
  });

  const manifest: PluginManifest = {
    id: "resource-example",
    name: "Resource example",
    version: "1.0.0",
    description: "Plugin-owned resource example",
    apiVersion: "1.0",
    main: "./dist/index.js",
    database: { migrationsPath: "./migrations/sql" },
    capabilities: {
      resourceRecords: resourceCapability,
      database: { mode: "plugin_schema" },
      audit: { write: true },
    },
  };
  it("requires a matching deletion handler and its backing host capabilities", () => {
    expect(validateManifest(manifest).ok).toBe(true);
    expect(
      validateRegistration(manifest, {
        resourceLifecycle: {
          schemaVersion: "1",
          deleteRecords: async () => {},
          cleanupTenant: async () => ({ complete: true }),
        },
      }),
    ).toEqual([]);
    expect(validateRegistration(manifest, {})).toEqual([
      expect.objectContaining({
        path: "$.resourceLifecycle",
        code: "missing-registration",
      }),
    ]);
    expect(
      validateRegistration(
        { ...manifest, capabilities: { audit: { write: true } } },
        {
          resourceLifecycle: {
            schemaVersion: "1",
            deleteRecords: async () => {},
            cleanupTenant: async () => ({ complete: true }),
          },
        },
      ),
    ).toEqual([expect.objectContaining({ code: "undeclared-capability" })]);
    expect(
      validateRegistration(manifest, {
        resourceLifecycle: {
          schemaVersion: "1",
          cleanupTenant: async () => ({ complete: true }),
        },
      } as never),
    ).toEqual([
      expect.objectContaining({ path: "$.resourceLifecycle.deleteRecords" }),
    ]);
    expect(
      validateRegistration(manifest, {
        resourceLifecycle: {
          schemaVersion: "2",
          deleteRecords: async () => {},
          cleanupTenant: async () => ({ complete: true }),
        },
      } as never),
    ).toEqual([expect.objectContaining({ code: "metadata-mismatch" })]);
    expect(
      validateManifest({
        ...manifest,
        capabilities: { resourceRecords: resourceCapability },
      }).ok,
    ).toBe(false);
  });
  it("requires explicit bounded mutation targets before record SQL admission", () => {
    for (const value of [
      { kind: "incident", purpose: "records" },
      { kind: "incident", purpose: "records", operation: "write", ids: [] },
      {
        kind: "incident",
        purpose: "records",
        operation: "write",
        ids: ["incident-1", "incident-1"],
      },
      {
        kind: "incident",
        purpose: "records",
        operation: "write",
        ids: Array.from({ length: 101 }, (_, n) => `incident-${n}`),
      },
      {
        kind: "incident",
        purpose: "configuration",
        operation: "write",
        ids: ["incident-1"],
      },
    ]) {
      expect(validatePluginResourceTransaction(value).length).toBeGreaterThan(
        0,
      );
      expect(
        ajv.getSchema(PLUGIN_RESOURCE_TRANSACTION_SCHEMA.$id)!(value),
      ).toBe(false);
    }
    expect(
      validatePluginResourceTransaction({
        kind: "incident",
        purpose: "configuration",
      }),
    ).toEqual([]);
    expect(
      validatePluginResourceTransaction({
        kind: "incident",
        purpose: "records",
        operation: "write",
        ids: ["incident-1"],
      }),
    ).toEqual([]);
    expect(
      validateRegistration(manifest, {
        resourceLifecycle: {
          schemaVersion: "1",
          deleteRecords: async () => {},
        },
      } as never),
    ).toEqual([
      expect.objectContaining({ path: "$.resourceLifecycle.cleanupTenant" }),
    ]);
  });
});

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
import {
  validateManifest,
  validateRegistration,
  validatePluginResourceQuery,
  validateStructuredEnrichmentInput,
  PLUGIN_FRONTEND_CAPABILITIES,
} from "@opsrabbit/plugin-sdk";
import {
  createRegisteredResource,
  queryRegisteredResources,
  enrichRegisteredResource,
} from "./reference.mjs";
const resources = {
  schemaVersion: "1",
  kinds: {
    incident: {
      labelKey: "incident.title",
      descriptionKey: "incident.description",
      retention: {
        defaultMode: "retain_indefinitely",
        supportedModes: [
          "do_not_persist",
          "retain_for_days",
          "retain_indefinitely",
        ],
      },
    },
  },
};
const manifest = {
  id: "resource-example",
  name: "Resource example",
  version: "1.0.0",
  description: "Specialist resource workspace",
  apiVersion: "1.0",
  main: "./dist/index.js",
  minimumOpsRabbitVersion: "0.8.0",
  database: { migrationsPath: "./migrations/sql" },
  navigation: {
    kind: "plugin_workspace",
    moduleKey: "incidents",
    path: "/apps/incidents",
    icon: "alert_triangle",
    fallbackTitle: "Incidents",
    section: "primary",
  },
  frontend: {
    kind: "native_workspace",
    entry: "./dist/frontend.js",
    styles: [],
    assets: [],
    sdkVersion: "1",
    mountIsolation: "shadow_dom",
    capabilities: [
      "plugin.actions.invoke",
      "plugin.resources.manage",
      "plugin.investigations.open",
    ],
    actionIds: ["list_records"],
  },
  capabilities: {
    resourceRecords: resources,
    database: { mode: "plugin_schema" },
    audit: { write: true },
    actions: [{ id: "list_records", risk: "read", requiredRole: "viewer" }],
  },
};
assert.equal(validateManifest(manifest).ok, true);
assert.deepEqual(
  validateRegistration(manifest, {
    actions: [
      {
        id: "list_records",
        title: "List",
        risk: "read",
        requiredRole: "viewer",
        run: async () => [],
      },
    ],
    resourceLifecycle: {
      schemaVersion: "1",
      deleteRecords: async () => {},
      cleanupTenant: async () => ({ complete: true }),
    },
  }),
  [],
);
assert.ok(PLUGIN_FRONTEND_CAPABILITIES.includes("plugin.investigations.open"));
const query = {
  schemaVersion: "1",
  kind: "incident",
  tenantIds: "all",
  candidates: {
    sql: "select tenant_id,id as resource_id from incidents",
    parameters: [],
  },
  orderBy: [{ column: "resource_id", direction: "asc" }],
  page: 1,
  pageSize: 25,
};
assert.deepEqual(validatePluginResourceQuery(query), []);
assert.ok(validatePluginResourceQuery({ ...query, pageSize: 1000 }).length);
const context = {
  tenantId: "tenant-a",
  actor: { id: "owner-a", role: "admin", kind: "user" },
  signal: new globalThis.AbortController().signal,
};
await assert.rejects(
  () => queryRegisteredResources(context, query),
  /unavailable/,
);
const order = [];
const resourceRecords = {
  transaction: async (input, run) => {
    assert.deepEqual(input, {
      kind: "incident",
      purpose: "records",
      operation: "create",
      ids: ["incident-1"],
    });
    order.push("policy-admission");
    await run({
      database: {},
      register: async () => {
        order.push("register");
        return { ownerUserId: "owner-a" };
      },
    });
    order.push("commit");
  },
};
await createRegisteredResource(
  { ...context, resourceRecords },
  {
    kind: "incident",
    id: "incident-1",
    eligibleAt: "2026-10-16T00:00:00.000Z",
  },
  async (_db, ownerId) => {
    assert.equal(ownerId, "owner-a");
    order.push("canonical-write");
  },
);
assert.deepEqual(order, [
  "policy-admission",
  "register",
  "canonical-write",
  "commit",
]);
const input = {
  schemaVersion: "1",
  resource: { kind: "incident", id: "incident-1" },
  title: "AUTH-42",
  description: "Synthetic event",
  fields: {},
  generateTitle: true,
  timeoutMs: 30000,
};
assert.deepEqual(validateStructuredEnrichmentInput(input), []);
await assert.rejects(
  () =>
    enrichRegisteredResource(
      {
        ...context,
        structuredEnrichment: {
          enrich: async () => ({
            status: "completed",
            values: { tenant_id: "tenant-b" },
          }),
        },
      },
      input,
    ),
  /Invalid enrichment result/,
);

// Public JSON Schema subpaths must resolve from the packed consumer.
import.meta.resolve("@opsrabbit/plugin-sdk/plugin-resource-capability-schema");
import.meta.resolve("@opsrabbit/plugin-sdk/plugin-resource-deletion-schema");
import.meta.resolve("@opsrabbit/plugin-sdk/plugin-resource-query-schema");
import.meta
  .resolve("@opsrabbit/plugin-sdk/plugin-resource-registration-schema");
import.meta.resolve("@opsrabbit/plugin-sdk/plugin-resource-transaction-schema");
import.meta
  .resolve("@opsrabbit/plugin-sdk/plugin-source-inbound-binding-schema");
import.meta.resolve("@opsrabbit/plugin-sdk/structured-enrichment-input-schema");
import.meta
  .resolve("@opsrabbit/plugin-sdk/structured-enrichment-result-schema");

const { saveInboundBusinessConfiguration } =
  await import("./inbound-registration.mjs");
const {
  validatePluginInboundRegistration,
  PLUGIN_INBOUND_REGISTRATION_SCHEMA,
} = await import("@opsrabbit/plugin-sdk");
const registrationCapability = {
  schemaVersion: "1",
  resourceKind: "incident",
  sourceProviders: ["webhook"],
  labelKey: "incident.save",
  descriptionKey: "incident.description",
  configuration: {
    readActionId: "read-config",
    writeActionId: "write-config",
    fields: [
      {
        key: "mapping",
        labelKey: "incident.mapping",
        type: "json",
        default: {},
      },
    ],
  },
};
assert.deepEqual(validatePluginInboundRegistration(registrationCapability), []);
assert.deepEqual(
  JSON.parse(
    readFileSync(
      require.resolve("@opsrabbit/plugin-sdk/plugin-inbound-registration-schema"),
      "utf8",
    ),
  ),
  PLUGIN_INBOUND_REGISTRATION_SCHEMA,
);
let savedConfiguration = false;
const inboundContext = {
  tenantId: "tenant-a",
  signal: new globalThis.AbortController().signal,
  resourceRecords: {
    sourceInbounds: async () => [
      {
        id: "source-1",
        incarnationId: "instance-1",
        binding: { enabled: false, revision: 0 },
      },
    ],
    transaction: async (input, run) => {
      assert.equal(input.purpose, "configuration");
      return run({
        database: {},
        bindSourceInbound: async (binding) => {
          assert.deepEqual(binding, {
            inboundId: "source-1",
            kind: "incident",
            enabled: false,
            expectedRevision: 0,
            expectedIncarnationId: "instance-1",
          });
          return { revision: 1 };
        },
      });
    },
  },
};
const inboundInput = {
  inboundId: "source-1",
  incarnationId: "instance-1",
  revision: 0,
  values: { mapping: {} },
};
await saveInboundBusinessConfiguration(
  inboundContext,
  registrationCapability,
  inboundInput,
  async (_database, saved) => {
    assert.equal(saved.revision, 1);
    savedConfiguration = true;
  },
);
assert.equal(savedConfiguration, true);
await assert.rejects(
  saveInboundBusinessConfiguration(
    inboundContext,
    registrationCapability,
    { ...inboundInput, incarnationId: "recreated" },
    async () => {},
  ),
  /unavailable/,
);

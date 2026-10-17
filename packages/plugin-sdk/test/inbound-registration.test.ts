import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  PLUGIN_INBOUND_REGISTRATION_SCHEMA,
  PLUGIN_INBOUND_CONFIGURATION_REQUEST_SCHEMA,
  PLUGIN_INBOUND_CONFIGURATION_SCHEMA,
  validatePluginInboundRegistration,
  validatePluginInboundConfigurationRequest,
  validatePluginInboundConfiguration,
  validateManifest,
  validatePluginSourceInboundBinding,
  type PluginDeclaredCapabilities,
  type PluginInboundRegistrationCapabilityV1,
} from "../src/index.js";

const capability: PluginInboundRegistrationCapabilityV1 = {
  schemaVersion: "1",
  resourceKind: "incident",
  sourceProviders: ["webhook", "email"],
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
      {
        key: "title_enrichment",
        labelKey: "incident.enrichment",
        type: "boolean",
        default: false,
      },
      {
        key: "profile",
        labelKey: "incident.profile",
        type: "text",
        default: "default",
      },
    ],
  },
};
const capabilities: PluginDeclaredCapabilities = {
  inboundRegistration: capability,
  inboundLifecycle: { schemaVersion: "1" },
  resourceRecords: {
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
  },
  database: { mode: "plugin_schema" },
  audit: { write: true },
  localization: { schemaVersion: "1" },
  actions: [
    { id: "read-config", risk: "read", requiredRole: "admin" },
    { id: "write-config", risk: "write", requiredRole: "admin" },
  ],
};
const configuration = {
  inboundId: "source-1",
  incarnationId: "instance-1",
  revision: 0,
  values: {
    mapping: { version: 1 },
    title_enrichment: false,
    profile: "default",
  },
};
const manifest = {
  id: "incident-register",
  name: "Incidents",
  description: "Registers source incidents.",
  version: "0.1.0",
  apiVersion: "1.0",
  main: "./dist/index.js",
  database: { migrationsPath: "./migrations/sql" },
  localization: {
    schemaVersion: "1",
    defaultLocale: "en",
    supportedLocales: ["en", "es"],
    path: "./locales/messages",
  },
  capabilities,
};

describe("host-owned Inbound registration declarations", () => {
  it.each([null, false, 0, ""])(
    "rejects a falsy capability declaration %s in the complete manifest",
    (inboundRegistration) => {
      const candidate = {
        ...manifest,
        capabilities: { ...capabilities, inboundRegistration },
      };
      expect(validateManifest(candidate).issues.length).toBeGreaterThan(0);
      const file = JSON.parse(
        readFileSync(
          new URL("../schemas/opsrabbit-plugin.schema.json", import.meta.url),
          "utf8",
        ),
      );
      expect(
        new Ajv2020({ strict: true, validateFormats: false }).compile(file)(
          candidate,
        ),
      ).toBe(false);
    },
  );
  it.each([{}, { kinds: null }, { kinds: {} }])(
    "reports malformed resource dependencies without throwing",
    (resourceRecords) => {
      const candidate = {
        ...manifest,
        capabilities: { ...capabilities, resourceRecords },
      };
      expect(() => validateManifest(candidate)).not.toThrow();
      expect(validateManifest(candidate).issues.length).toBeGreaterThan(0);
    },
  );
  it("accepts tenant-admin business configuration without plugin enablement or grant fields", () => {
    expect(validateManifest(manifest).issues).toEqual([]);
    expect(validatePluginInboundRegistration(capability, capabilities)).toEqual(
      [],
    );
    expect(
      validatePluginInboundRegistration({
        schemaVersion: "1",
        resourceKind: "incident",
        sourceProviders: ["webhook"],
        labelKey: "incident.save",
        descriptionKey: "incident.description",
      }),
    ).toEqual([]);
    expect(
      validatePluginInboundConfigurationRequest({ inboundId: "source-1" }),
    ).toEqual([]);
    expect(
      validatePluginInboundConfiguration(configuration, capability),
    ).toEqual([]);
  });
  it.each(["enabled", "grants", "tenant_id", "owner_id", "retention_policy"])(
    "rejects plugin ownership of core control %s",
    (key) => {
      const invalid = {
        ...capability,
        configuration: {
          ...capability.configuration,
          fields: [
            {
              key,
              labelKey: "incident.control",
              type: "boolean",
              default: false,
            },
          ],
        },
      };
      expect(
        validatePluginInboundRegistration(invalid, capabilities).length,
      ).toBeGreaterThan(0);
      const ajv = new Ajv2020({ strict: true, validateFormats: false });
      expect(ajv.compile(PLUGIN_INBOUND_REGISTRATION_SCHEMA)(invalid)).toBe(
        false,
      );
      const manifestSchema = JSON.parse(
        readFileSync(
          new URL("../schemas/opsrabbit-plugin.schema.json", import.meta.url),
          "utf8",
        ),
      );
      expect(
        ajv.compile(manifestSchema)({
          ...manifest,
          capabilities: { ...capabilities, inboundRegistration: invalid },
        }),
      ).toBe(false);
    },
  );
  it("rejects unknown, duplicated or wrongly typed fields", () => {
    expect(
      validatePluginInboundRegistration({ ...capability, arbitrary: true })
        .length,
    ).toBeGreaterThan(0);
    expect(
      validatePluginInboundRegistration({ ...capability, sourceProviders: [] })
        .length,
    ).toBeGreaterThan(0);
    expect(
      validatePluginInboundRegistration({
        ...capability,
        configuration: {
          ...capability.configuration,
          fields: [
            capability.configuration!.fields[0],
            capability.configuration!.fields[0],
          ],
        },
      }).length,
    ).toBeGreaterThan(0);
    for (const type of ["boolean", "text"])
      expect(
        validatePluginInboundRegistration({
          ...capability,
          configuration: {
            ...capability.configuration,
            fields: [
              { key: "field", labelKey: "incident.field", type, default: 42 },
            ],
          },
        }).length,
      ).toBeGreaterThan(0);
    expect(
      validatePluginInboundConfiguration(
        { ...configuration, enabled: true },
        capability,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validatePluginInboundConfiguration(
        {
          ...configuration,
          values: { ...configuration.values, unknown: true },
        },
        capability,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validatePluginInboundConfiguration(
        {
          ...configuration,
          values: { mapping: {}, title_enrichment: "false", profile: 5 },
        },
        capability,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validatePluginInboundConfigurationRequest({ inboundId: "" }).length,
    ).toBeGreaterThan(0);
    expect(
      validatePluginInboundConfiguration({ ...configuration, revision: -1 })
        .length,
    ).toBeGreaterThan(0);
    expect(validatePluginInboundConfiguration(configuration)).toEqual([]);
  });
  it.each([
    ["boolean", "false"],
    ["text", 42],
  ])(
    "rejects mismatched %s defaults in runtime and published schemas",
    (type, value) => {
      const invalid = {
        ...capability,
        configuration: {
          ...capability.configuration,
          fields: [
            {
              key: "setting",
              labelKey: "incident.setting",
              type,
              default: value,
            },
          ],
        },
      };
      expect(validatePluginInboundRegistration(invalid).length).toBeGreaterThan(
        0,
      );
      expect(
        new Ajv2020({ strict: true, validateFormats: false }).compile(
          PLUGIN_INBOUND_REGISTRATION_SCHEMA,
        )(invalid),
      ).toBe(false);
    },
  );
  it("accepts concurrency fences without permitting invalid versions or replacement identities", () => {
    expect(
      validatePluginSourceInboundBinding({
        inboundId: "source-1",
        kind: "incident",
        enabled: false,
        expectedRevision: 0,
        expectedIncarnationId: "instance-1",
      }),
    ).toEqual([]);
    expect(
      validatePluginSourceInboundBinding({
        inboundId: "source-1",
        kind: "incident",
        enabled: false,
        expectedRevision: -1,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validatePluginSourceInboundBinding({
        inboundId: "source-1",
        kind: "incident",
        enabled: false,
        expectedIncarnationId: "",
      }).length,
    ).toBeGreaterThan(0);
  });
  it("requires matching lifecycle, resource and localized admin action declarations", () => {
    for (const key of [
      "resourceRecords",
      "inboundLifecycle",
      "localization",
    ] as const)
      expect(
        validatePluginInboundRegistration(capability, {
          ...capabilities,
          [key]: undefined,
        }).length,
      ).toBeGreaterThan(0);
    for (const actions of [
      [],
      [{ id: "read-config", risk: "write", requiredRole: "admin" }],
      [
        { id: "read-config", risk: "read", requiredRole: "viewer" },
        { id: "write-config", risk: "write", requiredRole: "admin" },
      ],
      [
        { id: "read-config", risk: "read", requiredRole: "admin" },
        {
          id: "write-config",
          risk: "write",
          requiredRole: "admin",
          deploymentAdminOnly: true,
        },
      ],
    ] as const)
      expect(
        validatePluginInboundRegistration(capability, {
          ...capabilities,
          actions: [...actions],
        }).length,
      ).toBeGreaterThan(0);
  });
  it.each([
    [
      "plugin-inbound-registration",
      PLUGIN_INBOUND_REGISTRATION_SCHEMA,
      capability,
      validatePluginInboundRegistration,
    ],
    [
      "plugin-inbound-configuration-request",
      PLUGIN_INBOUND_CONFIGURATION_REQUEST_SCHEMA,
      { inboundId: "source-1" },
      validatePluginInboundConfigurationRequest,
    ],
    [
      "plugin-inbound-configuration",
      PLUGIN_INBOUND_CONFIGURATION_SCHEMA,
      configuration,
      validatePluginInboundConfiguration,
    ],
  ] as const)(
    "publishes schema parity for %s",
    (name, shape, valid, validate) => {
      const file = JSON.parse(
        readFileSync(
          new URL(`../schemas/opsrabbit-${name}.schema.json`, import.meta.url),
          "utf8",
        ),
      );
      expect(file).toEqual(shape);
      const compiled = new Ajv2020({
        strict: true,
        validateFormats: false,
      }).compile(file);
      for (const value of [valid, null, {}, { ...valid, surprise: true }])
        expect(compiled(value)).toBe(validate(value).length === 0);
    },
  );
});

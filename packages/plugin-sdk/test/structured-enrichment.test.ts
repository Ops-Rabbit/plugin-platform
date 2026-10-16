import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import {
  STRUCTURED_ENRICHMENT_INPUT_SCHEMA,
  STRUCTURED_ENRICHMENT_RESULT_SCHEMA,
  validateStructuredEnrichmentInput,
  validateStructuredEnrichmentResult,
  validateManifest,
  type PluginStructuredEnrichmentInputV1,
} from "../src/index.js";
const input: PluginStructuredEnrichmentInputV1 = {
  schemaVersion: "1",
  resource: { kind: "incident", id: "incident-1" },
  title: "AUTH-42",
  description: "A synthetic login alert",
  generateTitle: true,
  fields: {
    severity: { type: "enum", label: "Severity", enumValues: ["high", "low"] },
    count: { type: "number", label: "Count" },
    confirmed: { type: "boolean", label: "Confirmed" },
    observed_at: { type: "date", label: "Observed at" },
    summary: { type: "text", label: "Summary" },
  },
  timeoutMs: 30000,
};
const completed = {
  status: "completed",
  title: "Unusual sign-in detected",
  values: {
    severity: "high",
    count: 2,
    confirmed: false,
    observed_at: "2026-10-16T00:00:00.000Z",
    summary: "Synthetic summary",
  },
};
const ajv = new Ajv2020({ strict: true, validateFormats: false });
const requestSchema = ajv.compile(STRUCTURED_ENRICHMENT_INPUT_SCHEMA);
const resultSchema = ajv.compile(STRUCTURED_ENRICHMENT_RESULT_SCHEMA);

describe("structured enrichment contracts", () => {
  it("ships the same request/result schemas as runtime validation", () => {
    for (const [name, schema] of [
      ["input", STRUCTURED_ENRICHMENT_INPUT_SCHEMA],
      ["result", STRUCTURED_ENRICHMENT_RESULT_SCHEMA],
    ] as const) {
      expect(
        JSON.parse(
          readFileSync(
            new URL(
              `../schemas/opsrabbit-structured-enrichment-${name}.schema.json`,
              import.meta.url,
            ),
            "utf8",
          ),
        ),
      ).toEqual(schema);
    }
    expect(validateStructuredEnrichmentInput(input)).toEqual([]);
    expect(requestSchema(input)).toBe(true);
    expect(validateStructuredEnrichmentResult(completed, input)).toEqual([]);
    expect(resultSchema(completed)).toBe(true);
  });
  it.each([
    null,
    [],
    {},
    { ...input, unknown: true },
    { ...input, generateTitle: "yes" },
    { ...input, generateTitle: false, fields: {} },
    { ...input, timeoutMs: 999 },
    { ...input, timeoutMs: 120001 },
    { ...input, title: "t".repeat(2001) },
    { ...input, description: "t".repeat(32769) },
    { ...input, fields: { id: { type: "text", label: "Identity" } } },
    { ...input, fields: { "bad.key": { type: "text", label: "Bad key" } } },
    { ...input, fields: { severity: { type: "enum", label: "Severity" } } },
    {
      ...input,
      fields: {
        summary: { type: "text", label: "Summary", enumValues: ["one"] },
      },
    },
    {
      ...input,
      fields: {
        severity: {
          type: "enum",
          label: "Severity",
          enumValues: ["high", "high"],
        },
      },
    },
    {
      ...input,
      fields: { constructor: { type: "text", label: "Constructor" } },
    },
    {
      ...input,
      fields: Object.fromEntries(
        Array.from({ length: 65 }, (_, n) => [
          `field_${n}`,
          { type: "text", label: "Field" },
        ]),
      ),
    },
  ])("schema and runtime reject malformed/unrequested work: %j", (value) => {
    expect(validateStructuredEnrichmentInput(value).length).toBeGreaterThan(0);
    expect(requestSchema(value)).toBe(false);
  });
  it.each([
    "tenant_id",
    "owner_user_id",
    "source_system_id",
    "source_title",
    "display_title",
    "title_provenance",
    "source_status",
    "investigation_status",
    "writeback_status",
    "thread_id",
    "binding_revision",
    "resource_id",
  ])("forbids enrichment of protected field %s", (key) => {
    const value = {
      ...input,
      fields: { [key]: { type: "text", label: "Protected field" } },
    };
    expect(validateStructuredEnrichmentInput(value).length).toBeGreaterThan(0);
    expect(requestSchema(value)).toBe(false);
  });
  it("allows independent title-only and extraction-only requests", () => {
    expect(validateStructuredEnrichmentInput({ ...input, fields: {} })).toEqual(
      [],
    );
    expect(
      validateStructuredEnrichmentInput({ ...input, generateTitle: false }),
    ).toEqual([]);
  });
  it.each([
    null,
    [],
    {},
    { status: "completed", values: [], title: "Title" },
    { ...completed, title: "" },
    { ...completed, title: "t".repeat(201) },
    { ...completed, values: { summary: "t".repeat(2001) } },
    { ...completed, values: { count: Number.NaN } },
    { status: "unavailable", reason: "unknown" },
    { status: "timeout", values: {} },
    { ...completed, values: { summary: { nested: true } } },
  ])("rejects malformed provider output: %j", (value) => {
    expect(
      validateStructuredEnrichmentResult(value, input).length,
    ).toBeGreaterThan(0);
    expect(resultSchema(value)).toBe(false);
  });
  it.each([
    { values: { tenant_id: "another-tenant" } },
    { values: { count: "2" } },
    { values: { confirmed: "false" } },
    { values: { observed_at: "2026-02-30T00:00:00.000Z" } },
    { values: { severity: "critical" } },
    { values: { summary: true } },
  ])(
    "rejects structurally valid but semantically unrequested output: %j",
    (patch) => {
      expect(
        validateStructuredEnrichmentResult({ ...completed, ...patch }, input)
          .length,
      ).toBeGreaterThan(0);
    },
  );
  it("does not permit a title when generation was disabled", () => {
    expect(
      validateStructuredEnrichmentResult(completed, {
        ...input,
        generateTitle: false,
      }),
    ).toEqual([expect.objectContaining({ path: "$.title" })]);
  });
  it("preserves unknown/null fields, empty extraction and unavailable/timeout states", () => {
    for (const value of [
      { status: "completed", values: { summary: null } },
      { status: "completed", values: {} },
      { status: "unavailable", reason: "policy_blocked" },
      { status: "timeout" },
    ])
      expect(validateStructuredEnrichmentResult(value, input)).toEqual([]);
    expect(
      validateStructuredEnrichmentResult(completed, { ...input, timeoutMs: 0 })
        .length,
    ).toBeGreaterThan(0);
  });
  it("binds enrichment to declared actions/jobs and requires audit", () => {
    const manifest = {
      id: "enrichment-example",
      name: "Enrichment",
      version: "1.0.0",
      description: "Bounded enrichment",
      apiVersion: "1.0",
      main: "./dist/index.js",
      database: { migrationsPath: "./migrations/sql" },
      capabilities: {
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
        scheduledJobs: [{ id: "enrich" }],
        audit: { write: true },
        structuredEnrichment: {
          schemaVersion: "1",
          scheduledJobIds: ["enrich"],
        },
      },
    };
    expect(validateManifest(manifest).ok).toBe(true);
    for (const structuredEnrichment of [
      { schemaVersion: "2", scheduledJobIds: ["enrich"] },
      { schemaVersion: "1" },
      { schemaVersion: "1", actionIds: ["missing"] },
      { schemaVersion: "1", scheduledJobIds: ["missing"] },
      { schemaVersion: "1", scheduledJobIds: [] },
    ])
      expect(
        validateManifest({
          ...manifest,
          capabilities: { ...manifest.capabilities, structuredEnrichment },
        }).ok,
      ).toBe(false);
    expect(
      validateManifest({
        ...manifest,
        capabilities: {
          structuredEnrichment: manifest.capabilities.structuredEnrichment,
        },
      }).ok,
    ).toBe(false);
  });
});

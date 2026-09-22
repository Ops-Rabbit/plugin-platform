import { describe, expect, it } from "vitest";
import {
  validateDataInsightDashboardTemplateCatalog,
  validateDataInsightAuthorizationContext,
  validateFormsAnalyticsCatalog,
} from "../src/validation/data-insight.js";

const catalog = {
  schema_version: 1,
  metric_contract_version: "1.0.0",
  datasets: [
    {
      dataset_id: "quality.records",
      label: "Quality records",
      module_key: "quality",
      record_type: "quality_record",
      dimensions: [
        { field_key: "category", value_type: "text", sensitivity: "internal" },
      ],
      measures: [
        { key: "record_count", aggregation: "count", unit: "records" },
      ],
      default_time_field: null,
    },
  ],
};

const templates = {
  schema_version: 1,
  templates: [
    {
      id: "quality-overview",
      title: "Quality overview",
      presentation: { show_date_range: true },
      authorization: {
        policy_key: "quality_reviewer",
        label: "Quality reviewer",
        description: "Can review the approved quality overview.",
        references: {
          reports: ["quality-summary"],
          metrics: ["record-count"],
        },
      },
      queries: [
        {
          key: "by-category",
          dataset_id: "quality.records",
          name: "By category",
          semantic_query: {
            dimensions: ["category"],
            measures: ["record_count"],
          },
        },
      ],
      widgets: [
        {
          key: "category-chart",
          type: "bar",
          title: "By category",
          query_key: "by-category",
        },
      ],
    },
  ],
};

describe("Data Insight public catalog validation", () => {
  it("accepts valid analytics and dashboard-template catalogs", () => {
    expect(validateFormsAnalyticsCatalog(catalog)).toMatchObject({
      ok: true,
      issues: [],
    });
    expect(
      validateDataInsightDashboardTemplateCatalog(templates),
    ).toMatchObject({ ok: true, issues: [] });
  });

  it("accepts governed plugin-native saved-query references", () => {
    const pluginTemplates = structuredClone(templates);
    const references: Record<string, string[]> =
      pluginTemplates.templates[0]!.authorization.references;
    references.saved_queries = ["quality-by-category"];
    pluginTemplates.templates[0]!.queries = [
      {
        key: "by-category",
        name: "By category",
        plugin_query: {
          saved_query_id: "quality-by-category",
          datasource_id: "quality-db",
        },
      },
    ] as never;
    expect(
      validateDataInsightDashboardTemplateCatalog(pluginTemplates),
    ).toMatchObject({ ok: true, issues: [] });
  });

  it("rejects mixed and undeclared plugin-native query sources", () => {
    const mixed = structuredClone(templates);
    Object.assign(mixed.templates[0]!.queries[0]!, {
      plugin_query: { saved_query_id: "quality-by-category" },
    });
    expect(validateDataInsightDashboardTemplateCatalog(mixed).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-source" }),
      ]),
    );

    const undeclared = structuredClone(templates);
    undeclared.templates[0]!.queries = [
      {
        key: "native",
        name: "Native",
        plugin_query: { saved_query_id: "not-declared" },
      },
    ] as never;
    expect(
      validateDataInsightDashboardTemplateCatalog(undeclared).issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "undeclared-reference" }),
      ]),
    );
  });

  it("keeps published schemas aligned with runtime validation", async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const analyticsSchema = JSON.parse(
      await readFile(
        resolve(
          import.meta.dirname,
          "../schemas/opsrabbit-forms-analytics-catalog.schema.json",
        ),
        "utf8",
      ),
    );
    const templateSchema = JSON.parse(
      await readFile(
        resolve(
          import.meta.dirname,
          "../schemas/opsrabbit-data-insight-template-catalog.schema.json",
        ),
        "utf8",
      ),
    );
    const authorizationSchema = JSON.parse(
      await readFile(
        resolve(
          import.meta.dirname,
          "../schemas/opsrabbit-data-insight-authorization-context.schema.json",
        ),
        "utf8",
      ),
    );
    const authorization = {
      schemaVersion: 1,
      mode: "dashboard_chat",
      policyKey: "quality_reviewer",
      dashboardId: "dashboard-1",
      subject: { type: "group", id: "group-1" },
      allowedReferences: {
        reports: ["quality-summary"],
        metrics: ["record-count"],
      },
    };
    expect(ajv.compile(analyticsSchema)(catalog)).toBe(true);
    expect(ajv.compile(templateSchema)(templates)).toBe(true);
    expect(
      ajv.compile(analyticsSchema)({ ...catalog, executable: "./query.js" }),
    ).toBe(false);
    expect(
      validateFormsAnalyticsCatalog({ ...catalog, executable: "./query.js" })
        .ok,
    ).toBe(false);
    expect(ajv.compile(authorizationSchema)(authorization)).toBe(true);
    expect(validateDataInsightAuthorizationContext(authorization)).toEqual({
      ok: true,
      value: authorization,
      issues: [],
    });
    const unicodeAuthorization = {
      ...authorization,
      dashboardId: "😀".repeat(200),
      subject: { type: "group", id: "😀".repeat(200) },
      allowedReferences: { reports: ["😀".repeat(200)] },
    } as const;
    expect(ajv.compile(authorizationSchema)(unicodeAuthorization)).toBe(true);
    expect(
      validateDataInsightAuthorizationContext(unicodeAuthorization).ok,
    ).toBe(true);
    const invalidAuthorization = {
      ...authorization,
      policyKey: `p${"x".repeat(80)}`,
      allowedReferences: { metrics: [" "] },
    };
    expect(ajv.compile(authorizationSchema)(invalidAuthorization)).toBe(false);
    expect(
      validateDataInsightAuthorizationContext(invalidAuthorization).ok,
    ).toBe(false);
    const blankIdentifiers = {
      ...authorization,
      dashboardId: " ",
      subject: { type: "group", id: " " },
    };
    expect(ajv.compile(authorizationSchema)(blankIdentifiers)).toBe(false);
    expect(validateDataInsightAuthorizationContext(blankIdentifiers).ok).toBe(
      false,
    );
    const invalidTemplate = structuredClone(templates);
    invalidTemplate.templates[0]!.authorization!.references.metrics = [" "];
    expect(ajv.compile(templateSchema)(invalidTemplate)).toBe(false);
    expect(
      validateDataInsightDashboardTemplateCatalog(invalidTemplate).ok,
    ).toBe(false);
    const invalidPresentation = structuredClone(templates);
    invalidPresentation.templates[0]!.authorization!.label = " ";
    invalidPresentation.templates[0]!.authorization!.description = "x".repeat(
      1001,
    );
    expect(ajv.compile(templateSchema)(invalidPresentation)).toBe(false);
    expect(
      validateDataInsightDashboardTemplateCatalog(invalidPresentation).ok,
    ).toBe(false);
  });

  it("rejects malformed or over-broad authorization attestations", () => {
    expect(
      validateDataInsightAuthorizationContext({
        schemaVersion: 2,
        mode: "admin",
        policyKey: "Mutable Label",
        dashboardId: "",
        subject: { type: "user", id: "" },
        allowedReferences: {
          reports: ["duplicate", "duplicate"],
          "Bad Namespace": [],
        },
        tenantId: "must-not-be-overridden",
      }),
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: "$.schemaVersion" }),
        expect.objectContaining({ path: "$.mode" }),
        expect.objectContaining({ path: "$.subject.type" }),
        expect.objectContaining({ code: "duplicate" }),
        expect.objectContaining({ code: "unknown-property" }),
      ]),
    });
  });

  it("rejects duplicate datasets, invalid measure contracts, and unknown properties", () => {
    const invalid = structuredClone(catalog);
    invalid.datasets.push({
      ...invalid.datasets[0],
      measures: [{ key: "amount", aggregation: "sum", unit: "units" }],
      executable: "./query.js",
    } as never);
    const result = validateFormsAnalyticsCatalog(invalid);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate" }),
        expect.objectContaining({
          path: "$.datasets[1].measures[0].field_key",
        }),
        expect.objectContaining({ code: "unknown-property" }),
      ]),
    );
  });

  it("rejects broken widget references and duplicate template identifiers", () => {
    const invalid = structuredClone(templates);
    const template = invalid.templates[0]!;
    const widget = template.widgets[0]!;
    invalid.templates.push({
      ...template,
      widgets: [{ ...widget, query_key: "missing" }],
    });
    const result = validateDataInsightDashboardTemplateCatalog(invalid);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate" }),
        expect.objectContaining({ code: "invalid-source" }),
      ]),
    );
  });

  it("rejects invalid dashboard presentation settings", () => {
    const invalid = structuredClone(templates);
    invalid.templates[0]!.presentation = { show_date_range: "yes" as never };

    const result = validateDataInsightDashboardTemplateCatalog(invalid);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "$.templates[0].presentation.show_date_range",
          code: "type",
        }),
      ]),
    );
  });

  it("reports malformed analytics catalog structures without throwing", () => {
    expect(validateFormsAnalyticsCatalog(null).ok).toBe(false);
    expect(
      validateFormsAnalyticsCatalog({
        schema_version: 2,
        metric_contract_version: "",
        datasets: "invalid",
      }).issues,
    ).toHaveLength(3);
    const result = validateFormsAnalyticsCatalog({
      schema_version: 1,
      metric_contract_version: "1",
      datasets: [
        null,
        {
          dataset_id: "Bad ID",
          label: "",
          module_key: "Bad Key",
          record_type: "Bad Key",
          parent_record_type: "Bad Key",
          dimensions: [
            null,
            {
              field_key: "Bad Key",
              value_type: "invalid",
              sensitivity: "",
              extra: true,
            },
          ],
          measures: [
            null,
            {
              key: "broken",
              aggregation: "ratio_percent",
              unit: "",
              divisor: 0,
              denominator_divisor: "invalid",
              field_key: "Bad Key",
              extra: true,
            },
          ],
          default_time_field: "Bad Key",
          extra: true,
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(15);
  });

  it("reports malformed template catalog structures without throwing", () => {
    expect(validateDataInsightDashboardTemplateCatalog([]).ok).toBe(false);
    expect(
      validateDataInsightDashboardTemplateCatalog({
        schema_version: 2,
        templates: "invalid",
      }).issues,
    ).toHaveLength(2);
    const result = validateDataInsightDashboardTemplateCatalog({
      schema_version: 1,
      templates: [
        null,
        {
          id: "Bad ID",
          title: "",
          description: "",
          queries: [
            null,
            {
              key: "Bad Key",
              dataset_id: "Bad ID",
              name: "",
              semantic_query: [],
              extra: true,
            },
          ],
          widgets: [
            null,
            {
              key: "Bad Key",
              type: "unknown",
              title: "",
              query_key: "missing",
              extra: true,
            },
            { key: "text", type: "text", title: "Text", text_content: "" },
          ],
          extra: true,
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(12);
  });
});
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";

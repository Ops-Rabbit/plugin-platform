import { describe, expect, it } from "vitest";
import {
  validateDataInsightDashboardTemplateCatalog,
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
    expect(ajv.compile(analyticsSchema)(catalog)).toBe(true);
    expect(ajv.compile(templateSchema)(templates)).toBe(true);
    expect(
      ajv.compile(analyticsSchema)({ ...catalog, executable: "./query.js" }),
    ).toBe(false);
    expect(
      validateFormsAnalyticsCatalog({ ...catalog, executable: "./query.js" })
        .ok,
    ).toBe(false);
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

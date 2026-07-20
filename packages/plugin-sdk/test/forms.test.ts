import { describe, expect, it } from "vitest";
import type { FormStarterPackAsset } from "../src/contracts/forms.js";
import { validateFormStarterPack } from "../src/validation/forms.js";

const valid: FormStarterPackAsset = {
  formatVersion: 1,
  moduleKey: "quality",
  starters: [
    {
      starterKey: "quality_report",
      title: "Quality report",
      description: "Capture a controlled quality report.",
      recordType: "quality_report",
      badge: "Quality",
      icon: "check",
      schema: {
        fields: [
          { key: "batch_id", label: "Batch ID", type: "text", required: true },
          {
            key: "result",
            label: "Result",
            type: "select",
            options: [
              { value: "pass", label: "Pass" },
              { value: "fail", label: "Fail" },
            ],
          },
        ],
        sections: [
          {
            key: "report",
            label: "Report",
            fieldKeys: ["batch_id", "result"],
          },
        ],
        actions: [{ key: "submit", label: "Submit", kind: "submit" }],
      },
      listConfig: {
        columns: [
          { fieldKey: "batch_id", label: "Batch ID" },
          { fieldKey: "system_updated_at", label: "Updated" },
        ],
        searchFields: ["batch_id"],
        filterFields: ["result"],
        workspace: { showOnLanding: true, defaultOnLanding: true },
        pageSize: 20,
        defaultSort: "updated_at_desc",
      },
    },
  ],
};

describe("validateFormStarterPack", () => {
  it("accepts a strict declarative starter pack", () => {
    expect(validateFormStarterPack(valid)).toEqual({
      ok: true,
      value: valid,
      issues: [],
    });
  });

  it("accepts select fields backed by a plugin option source", () => {
    const starter = structuredClone(valid.starters[0]!);
    starter.schema.fields[1] = {
      key: "result",
      label: "Result",
      type: "select",
      optionSource: {
        kind: "plugin_route",
        route: "/form-options/results",
        dependsOn: ["batch_id"],
      },
    };
    expect(validateFormStarterPack({ ...valid, starters: [starter] })).toEqual({
      ok: true,
      value: { ...valid, starters: [starter] },
      issues: [],
    });
  });

  it("rejects unknown properties, duplicate keys, and broken references", () => {
    const starter = structuredClone(valid.starters[0]!);
    starter.schema.fields.push({
      ...starter.schema.fields[0]!,
      label: "Duplicate",
    });
    starter.schema.sections[0]!.fieldKeys.push("missing");
    const result = validateFormStarterPack({
      ...valid,
      unexpected: true,
      starters: [starter, starter],
    });
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["unknown-property", "duplicate", "invalid"]),
    );
  });

  it("enforces field-specific options, attachment flags, and workspace rules", () => {
    const starter = structuredClone(valid.starters[0]!);
    starter.schema.fields = [
      { key: "plain", label: "Plain", type: "text", options: [] },
      {
        key: "select_value",
        label: "Select",
        type: "select",
        attachmentMultiple: true,
      },
      {
        key: "dynamic_text",
        label: "Dynamic Text",
        type: "text",
        optionSource: { kind: "plugin_route", route: "/form-options/plain" },
      },
      {
        key: "bad_dynamic",
        label: "Bad Dynamic",
        type: "select",
        optionSource: { kind: "plugin_route", route: "../unsafe" },
      },
    ];
    starter.schema.sections[0]!.fieldKeys = [
      "plain",
      "select_value",
      "dynamic_text",
      "bad_dynamic",
    ];
    starter.listConfig.columns = [{ fieldKey: "unknown", label: "Unknown" }];
    starter.listConfig.workspace = {
      showOnLanding: false,
      defaultOnLanding: true,
    };
    const paths = validateFormStarterPack({
      ...valid,
      starters: [starter],
    }).issues.map(({ path }) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "$.starters[0].schema.fields[0].options",
        "$.starters[0].schema.fields[1].options",
        "$.starters[0].schema.fields[1].attachmentMultiple",
        "$.starters[0].schema.fields[2].optionSource",
        "$.starters[0].schema.fields[3].optionSource.route",
        "$.starters[0].listConfig.columns[0].fieldKey",
        "$.starters[0].listConfig.workspace.defaultOnLanding",
      ]),
    );
  });

  it("rejects malformed roots and bounded collections", () => {
    expect(validateFormStarterPack(null).issues[0]).toMatchObject({
      code: "type",
    });
    expect(
      validateFormStarterPack({
        formatVersion: 2,
        moduleKey: "Bad",
        starters: [],
      }).issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unsupported" }),
        expect.objectContaining({ path: "$.moduleKey" }),
        expect.objectContaining({ path: "$.starters" }),
      ]),
    );
  });
});

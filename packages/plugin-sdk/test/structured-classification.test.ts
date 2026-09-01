import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it, vi } from "vitest";
import type {
  PluginManifest,
  PluginStructuredClassificationInputV1,
} from "../src/index.js";
import {
  STRUCTURED_CLASSIFICATION_LIMITS,
  validateStructuredClassificationInput,
  validateStructuredClassificationResult,
} from "../src/index.js";
import {
  createAuthorizedTestContext,
  createTestContext,
} from "../src/testing/index.js";
import { validateManifest } from "../src/validation/manifest.js";

const input: PluginStructuredClassificationInputV1 = {
  schemaVersion: "1",
  content: "Policy failed to update.",
  instructions: "Select the best supported class.",
  classes: [
    {
      key: "verified_case",
      label: "Verified",
      description: "Proven cause and fix.",
      qualificationRequirements: ["Cause", "Fix", "Validation"],
    },
    {
      key: "diagnostic_signal",
      label: "Signal",
      description: "Useful incomplete evidence.",
      qualificationRequirements: ["Technical evidence"],
    },
  ],
  evidence: [{ id: "message:1", text: "Policy failed to update." }],
  timeoutMs: 30_000,
};
const manifest: PluginManifest = {
  id: "classifier",
  name: "Classifier",
  version: "1.0.0",
  description: "Classifies records.",
  apiVersion: "1.0",
  main: "./dist/index.js",
  capabilities: {
    actions: [{ id: "classify", risk: "write", requiredRole: "operator" }],
    scheduledJobs: [{ id: "classify-pending" }],
    structuredClassification: {
      schemaVersion: "1",
      actionIds: ["classify"],
      scheduledJobIds: ["classify-pending"],
    },
  },
};

describe("structured classification", () => {
  it("keeps malformed capability bindings aligned with the JSON Schema", () => {
    const schema = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, "../schemas/opsrabbit-plugin.schema.json"),
        "utf8",
      ),
    );
    const validateSchema = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(schema);
    const candidates = [
      { schemaVersion: "1", actionIds: "classify" },
      { schemaVersion: "1", actionIds: [] },
      {
        schemaVersion: "1",
        actionIds: Array.from({ length: 65 }, (_, index) => `action-${index}`),
      },
      { schemaVersion: "1", scheduledJobIds: [] },
    ];
    for (const structuredClassification of candidates) {
      const candidate = {
        ...manifest,
        capabilities: {
          ...manifest.capabilities,
          structuredClassification,
        },
      };
      expect(validateSchema(candidate)).toBe(false);
      expect(() => validateManifest(candidate)).not.toThrow();
      expect(validateManifest(candidate).ok).toBe(false);
    }
    const undeclared = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        structuredClassification: {
          schemaVersion: "1",
          actionIds: ["undeclared-action"],
        },
      },
    };
    expect(validateSchema(undeclared)).toBe(true);
    expect(validateManifest(undeclared).ok).toBe(false);
  });
  it("accepts either non-empty declared binding collection", () => {
    const actionOnly = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        structuredClassification: {
          schemaVersion: "1",
          actionIds: ["classify"],
        },
      },
    };
    const jobOnly = {
      ...manifest,
      capabilities: {
        ...manifest.capabilities,
        structuredClassification: {
          schemaVersion: "1",
          scheduledJobIds: ["classify-pending"],
        },
      },
    };
    expect(validateManifest(actionOnly).ok).toBe(true);
    expect(validateManifest(jobOnly).ok).toBe(true);
  });
  it("validates bounded requests and evidence-backed completed results", () => {
    expect(validateStructuredClassificationInput(input)).toEqual([]);
    expect(
      validateStructuredClassificationResult(input, {
        status: "completed",
        recommendedClassKey: "diagnostic_signal",
        confidence: 0.75,
        reason: "Useful evidence is present.",
        evidenceRefs: ["message:1"],
        missingEvidence: ["Confirmed remediation"],
      }),
    ).toEqual([]);
  });
  it("rejects unknown classes, invented evidence, and invalid confidence", () => {
    const issues = validateStructuredClassificationResult(input, {
      status: "completed",
      recommendedClassKey: "invented",
      confidence: 2,
      reason: "Unsupported.",
      evidenceRefs: ["message:2"],
      missingEvidence: [],
    });
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["unknown-class", "invalid", "provenance"]),
    );
  });
  it("rejects duplicate class keys and out-of-range timeouts", () => {
    const issues = validateStructuredClassificationInput({
      ...input,
      timeoutMs: 1,
      classes: [input.classes[0], input.classes[0]],
    });
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["limit", "duplicate"]),
    );
  });
  it("rejects malformed top-level input and every bounded collection", () => {
    expect(validateStructuredClassificationInput(null)).toEqual([
      expect.objectContaining({ path: "$", code: "type" }),
    ]);
    const issues = validateStructuredClassificationInput({
      ...input,
      schemaVersion: "2",
      content: " ",
      instructions: "x".repeat(
        STRUCTURED_CLASSIFICATION_LIMITS.maximumInstructionsBytes + 1,
      ),
      timeoutMs: STRUCTURED_CLASSIFICATION_LIMITS.maximumTimeoutMs + 1,
      classes: [input.classes[0]],
      evidence: Array.from(
        {
          length: STRUCTURED_CLASSIFICATION_LIMITS.maximumEvidenceItems + 1,
        },
        (_, index) => ({ id: `evidence:${index}`, text: "evidence" }),
      ),
      unexpected: true,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.unexpected", code: "unknown" }),
        expect.objectContaining({
          path: "$.schemaVersion",
          code: "unsupported",
        }),
        expect.objectContaining({ path: "$.content", code: "required" }),
        expect.objectContaining({ path: "$.instructions", code: "limit" }),
        expect.objectContaining({ path: "$.timeoutMs", code: "limit" }),
        expect.objectContaining({ path: "$.classes", code: "limit" }),
        expect.objectContaining({ path: "$.evidence", code: "limit" }),
      ]),
    );
  });
  it("rejects malformed classes and qualification requirements", () => {
    const issues = validateStructuredClassificationInput({
      ...input,
      classes: [
        "not-an-object",
        {
          key: "Invalid-Key",
          label: " ",
          description: "x".repeat(2_001),
          qualificationRequirements: [],
          extra: true,
        },
      ],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.classes[0]", code: "type" }),
        expect.objectContaining({
          path: "$.classes[1].extra",
          code: "unknown",
        }),
        expect.objectContaining({ path: "$.classes[1].key", code: "invalid" }),
        expect.objectContaining({
          path: "$.classes[1].label",
          code: "required",
        }),
        expect.objectContaining({
          path: "$.classes[1].description",
          code: "limit",
        }),
        expect.objectContaining({
          path: "$.classes[1].qualificationRequirements",
          code: "limit",
        }),
      ]),
    );
  });
  it("rejects malformed, duplicate, and oversized evidence", () => {
    const issues = validateStructuredClassificationInput({
      ...input,
      evidence: [
        false,
        { id: "bad id", text: " ", extra: true },
        { id: "message:1", text: "valid" },
        {
          id: "message:1",
          text: "x".repeat(
            STRUCTURED_CLASSIFICATION_LIMITS.maximumEvidenceTextBytes + 1,
          ),
        },
      ],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.evidence[0]", code: "type" }),
        expect.objectContaining({
          path: "$.evidence[1].extra",
          code: "unknown",
        }),
        expect.objectContaining({ path: "$.evidence[1].id", code: "invalid" }),
        expect.objectContaining({
          path: "$.evidence[1].text",
          code: "required",
        }),
        expect.objectContaining({
          path: "$.evidence[3].id",
          code: "duplicate",
        }),
        expect.objectContaining({ path: "$.evidence[3].text", code: "limit" }),
      ]),
    );
  });
  it.each([
    { status: "timeout" },
    { status: "unavailable", reason: "policy_blocked" },
  ])("accepts explicit non-completion result %#", (result) => {
    expect(validateStructuredClassificationResult(input, result)).toEqual([]);
  });
  it("rejects malformed status outcomes and unknown fields", () => {
    expect(validateStructuredClassificationResult(input, null)).toEqual([
      expect.objectContaining({ path: "$", code: "type" }),
    ]);
    expect(
      validateStructuredClassificationResult(input, {
        status: "timeout",
        reason: "late",
      }),
    ).toContainEqual(
      expect.objectContaining({ path: "$.reason", code: "unknown" }),
    );
    expect(
      validateStructuredClassificationResult(input, {
        status: "unavailable",
        reason: "provider_error",
        detail: "private",
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.reason", code: "invalid" }),
        expect.objectContaining({ path: "$.detail", code: "unknown" }),
      ]),
    );
    expect(
      validateStructuredClassificationResult(input, { status: "failed" }),
    ).toContainEqual(
      expect.objectContaining({ path: "$.status", code: "invalid" }),
    );
  });
  it("rejects oversized and structurally invalid completed output", () => {
    const oversizedRefs = Array.from(
      { length: STRUCTURED_CLASSIFICATION_LIMITS.maximumEvidenceItems + 1 },
      () => "message:1",
    );
    const issues = validateStructuredClassificationResult(input, {
      status: "completed",
      recommendedClassKey: 1,
      confidence: Number.NaN,
      reason: "x".repeat(
        STRUCTURED_CLASSIFICATION_LIMITS.maximumReasonBytes + 1,
      ),
      evidenceRefs: oversizedRefs,
      missingEvidence: "not-a-list",
      extra: true,
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.extra", code: "unknown" }),
        expect.objectContaining({
          path: "$.recommendedClassKey",
          code: "unknown-class",
        }),
        expect.objectContaining({ path: "$.confidence", code: "invalid" }),
        expect.objectContaining({ path: "$.reason", code: "limit" }),
        expect.objectContaining({ path: "$.evidenceRefs", code: "limit" }),
        expect.objectContaining({ path: "$.missingEvidence", code: "limit" }),
      ]),
    );
  });
  it("rejects duplicate evidence references and oversized missing-evidence items", () => {
    const issues = validateStructuredClassificationResult(input, {
      status: "completed",
      recommendedClassKey: "verified_case",
      confidence: 0,
      reason: "Qualification remains incomplete.",
      evidenceRefs: ["message:1", "message:1"],
      missingEvidence: ["x".repeat(1_001)],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.evidenceRefs", code: "provenance" }),
        expect.objectContaining({
          path: "$.missingEvidence[0]",
          code: "limit",
        }),
      ]),
    );
  });
  it("exposes the broker only to declared action and scheduled-job invocations", () => {
    const service = { classify: vi.fn() };
    expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "action", id: "classify" },
        { structuredClassification: service },
      ).structuredClassification,
    ).toBe(service);
    expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "scheduledJob", id: "classify-pending" },
        { structuredClassification: service },
      ).structuredClassification,
    ).toBe(service);
    expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "action", id: "other" },
        { structuredClassification: service },
      ).structuredClassification,
    ).toBeUndefined();
    expect(
      createTestContext({ structuredClassification: service })
        .structuredClassification,
    ).toBe(service);
  });
  it("fails closed when bindings, declarations, or the supplied broker are absent", () => {
    const service = { classify: vi.fn() };
    const withoutClassification: PluginManifest = {
      ...manifest,
      capabilities: {
        ...(manifest.capabilities.actions === undefined
          ? {}
          : { actions: manifest.capabilities.actions }),
        ...(manifest.capabilities.scheduledJobs === undefined
          ? {}
          : { scheduledJobs: manifest.capabilities.scheduledJobs }),
      },
    };
    expect(
      createAuthorizedTestContext(
        withoutClassification,
        { kind: "action", id: "classify" },
        { structuredClassification: service },
      ).structuredClassification,
    ).toBeUndefined();
    expect(
      createAuthorizedTestContext(
        manifest,
        { kind: "scheduledJob", id: "unbound-job" },
        { structuredClassification: service },
      ).structuredClassification,
    ).toBeUndefined();
    expect(
      createAuthorizedTestContext(manifest, {
        kind: "scheduledJob",
        id: "classify-pending",
      }).structuredClassification,
    ).toBeUndefined();
  });
});

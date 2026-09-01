import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import type { PluginStructuredClassificationInputV1 } from "../src/index.js";
import {
  STRUCTURED_CLASSIFICATION_LIMITS,
  validateStructuredClassificationInput,
  validateStructuredClassificationResult,
} from "../src/index.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const requestSchema = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../schemas/opsrabbit-structured-classification-request.schema.json",
    ),
    "utf8",
  ),
);
const resultSchema = JSON.parse(
  readFileSync(
    resolve(
      import.meta.dirname,
      "../schemas/opsrabbit-structured-classification-result.schema.json",
    ),
    "utf8",
  ),
);
const validateRequestSchema = ajv.compile(requestSchema);
const validateResultSchema = ajv.compile(resultSchema);

const request: PluginStructuredClassificationInputV1 = {
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

const completed = {
  status: "completed",
  recommendedClassKey: "diagnostic_signal",
  confidence: 0.75,
  reason: "Useful evidence is present.",
  evidenceRefs: ["message:1"],
  missingEvidence: ["Confirmed remediation"],
};

function runtimeAcceptsRequest(value: unknown): boolean {
  return validateStructuredClassificationInput(value).length === 0;
}

function runtimeAcceptsResult(value: unknown): boolean {
  return validateStructuredClassificationResult(request, value).length === 0;
}

describe("structured-classification published JSON Schemas", () => {
  it.each([
    ["normal request", request],
    [
      "minimum evidence request",
      { ...request, evidence: [], timeoutMs: 1_000 },
    ],
    [
      "ASCII request boundaries",
      {
        ...request,
        content: "x".repeat(
          STRUCTURED_CLASSIFICATION_LIMITS.maximumContentBytes,
        ),
        instructions: "x".repeat(
          STRUCTURED_CLASSIFICATION_LIMITS.maximumInstructionsBytes,
        ),
        evidence: [
          {
            id: "message:1",
            text: "x".repeat(
              STRUCTURED_CLASSIFICATION_LIMITS.maximumEvidenceTextBytes,
            ),
          },
        ],
      },
    ],
  ])("accepts valid request shape: %s", (_name, value) => {
    expect(
      validateRequestSchema(value),
      ajv.errorsText(validateRequestSchema.errors),
    ).toBe(true);
    expect(runtimeAcceptsRequest(value)).toBe(true);
  });

  it.each([
    ["unknown top-level field", { ...request, unexpected: true }],
    [
      "missing content",
      Object.fromEntries(
        Object.entries(request).filter(([key]) => key !== "content"),
      ),
    ],
    ["unsupported version", { ...request, schemaVersion: "2" }],
    ["blank content", { ...request, content: " \n\t" }],
    [
      "oversized content",
      {
        ...request,
        content: "x".repeat(
          STRUCTURED_CLASSIFICATION_LIMITS.maximumContentBytes + 1,
        ),
      },
    ],
    ["blank instructions", { ...request, instructions: " " }],
    [
      "oversized instructions",
      {
        ...request,
        instructions: "x".repeat(
          STRUCTURED_CLASSIFICATION_LIMITS.maximumInstructionsBytes + 1,
        ),
      },
    ],
    ["fractional timeout", { ...request, timeoutMs: 1_000.5 }],
    ["short timeout", { ...request, timeoutMs: 999 }],
    ["too few classes", { ...request, classes: [request.classes[0]] }],
    [
      "too many classes",
      {
        ...request,
        classes: Array.from({ length: 33 }, (_, index) => ({
          ...request.classes[0],
          key: `class_${index}`,
        })),
      },
    ],
    [
      "unknown class field",
      {
        ...request,
        classes: [
          { ...request.classes[0], unexpected: true },
          request.classes[1],
        ],
      },
    ],
    [
      "invalid class key",
      {
        ...request,
        classes: [
          { ...request.classes[0], key: "Invalid-Key" },
          request.classes[1],
        ],
      },
    ],
    [
      "blank class label",
      {
        ...request,
        classes: [{ ...request.classes[0], label: " " }, request.classes[1]],
      },
    ],
    [
      "empty qualification requirements",
      {
        ...request,
        classes: [
          { ...request.classes[0], qualificationRequirements: [] },
          request.classes[1],
        ],
      },
    ],
    [
      "oversized qualification requirement",
      {
        ...request,
        classes: [
          {
            ...request.classes[0],
            qualificationRequirements: ["x".repeat(1_001)],
          },
          request.classes[1],
        ],
      },
    ],
    [
      "too much evidence",
      {
        ...request,
        evidence: Array.from({ length: 65 }, (_, index) => ({
          id: `message:${index}`,
          text: "Evidence",
        })),
      },
    ],
    [
      "unknown evidence field",
      {
        ...request,
        evidence: [{ id: "message:1", text: "Evidence", unexpected: true }],
      },
    ],
    [
      "invalid evidence id",
      { ...request, evidence: [{ id: "bad id", text: "Evidence" }] },
    ],
    [
      "blank evidence text",
      { ...request, evidence: [{ id: "message:1", text: " " }] },
    ],
  ])("rejects request shape in schema and runtime: %s", (_name, value) => {
    expect(validateRequestSchema(value)).toBe(false);
    expect(runtimeAcceptsRequest(value)).toBe(false);
  });

  it("documents runtime-only request constraints", () => {
    const duplicateKeys = {
      ...request,
      classes: [
        request.classes[0],
        { ...request.classes[1], key: "verified_case" },
      ],
    };
    const duplicateEvidenceIds = {
      ...request,
      evidence: [
        { id: "message:1", text: "First" },
        { id: "message:1", text: "Second" },
      ],
    };
    const multibyteOverByteLimit = {
      ...request,
      content: "é".repeat(
        STRUCTURED_CLASSIFICATION_LIMITS.maximumContentBytes / 2 + 1,
      ),
    };
    for (const value of [
      duplicateKeys,
      duplicateEvidenceIds,
      multibyteOverByteLimit,
    ]) {
      expect(validateRequestSchema(value)).toBe(true);
      expect(runtimeAcceptsRequest(value)).toBe(false);
    }
  });

  it.each([
    ["completed", completed],
    ["timeout", { status: "timeout" }],
    ["not configured", { status: "unavailable", reason: "not_configured" }],
    ["policy blocked", { status: "unavailable", reason: "policy_blocked" }],
    [
      "capacity unavailable",
      { status: "unavailable", reason: "capacity_unavailable" },
    ],
  ])("accepts every result variant: %s", (_name, value) => {
    expect(
      validateResultSchema(value),
      ajv.errorsText(validateResultSchema.errors),
    ).toBe(true);
    expect(runtimeAcceptsResult(value)).toBe(true);
  });

  it.each([
    ["unknown completed field", { ...completed, unexpected: true }],
    [
      "missing completed field",
      Object.fromEntries(
        Object.entries(completed).filter(([key]) => key !== "reason"),
      ),
    ],
    ["invalid status", { status: "failed" }],
    ["invalid class syntax", { ...completed, recommendedClassKey: "Invalid" }],
    ["negative confidence", { ...completed, confidence: -0.01 }],
    ["excessive confidence", { ...completed, confidence: 1.01 }],
    ["string confidence", { ...completed, confidence: "0.5" }],
    ["blank reason", { ...completed, reason: " " }],
    [
      "oversized reason",
      {
        ...completed,
        reason: "x".repeat(
          STRUCTURED_CLASSIFICATION_LIMITS.maximumReasonBytes + 1,
        ),
      },
    ],
    [
      "too many evidence references",
      {
        ...completed,
        evidenceRefs: Array.from({ length: 65 }, () => "message:1"),
      },
    ],
    [
      "duplicate evidence references",
      { ...completed, evidenceRefs: ["message:1", "message:1"] },
    ],
    [
      "malformed evidence reference",
      { ...completed, evidenceRefs: ["bad id"] },
    ],
    [
      "too much missing evidence",
      {
        ...completed,
        missingEvidence: Array.from({ length: 33 }, () => "Missing"),
      },
    ],
    ["blank missing evidence", { ...completed, missingEvidence: [" "] }],
    [
      "oversized missing evidence",
      { ...completed, missingEvidence: ["x".repeat(1_001)] },
    ],
    [
      "unknown unavailable field",
      { status: "unavailable", reason: "not_configured", unexpected: true },
    ],
    ["invalid unavailable reason", { status: "unavailable", reason: "failed" }],
    ["non-string unavailable reason", { status: "unavailable", reason: 1 }],
    ["unknown timeout field", { status: "timeout", unexpected: true }],
  ])("rejects result shape in schema and runtime: %s", (_name, value) => {
    expect(validateResultSchema(value)).toBe(false);
    expect(runtimeAcceptsResult(value)).toBe(false);
  });

  it("documents runtime-only result constraints", () => {
    const unknownClass = {
      ...completed,
      recommendedClassKey: "unknown_class",
    };
    const unknownEvidence = { ...completed, evidenceRefs: ["message:2"] };
    const multibyteOverByteLimit = {
      ...completed,
      reason: "é".repeat(
        STRUCTURED_CLASSIFICATION_LIMITS.maximumReasonBytes / 2 + 1,
      ),
    };
    for (const value of [
      unknownClass,
      unknownEvidence,
      multibyteOverByteLimit,
    ]) {
      expect(validateResultSchema(value)).toBe(true);
      expect(runtimeAcceptsResult(value)).toBe(false);
    }
  });

  it("exports and inventories both public payload schemas", () => {
    const packageManifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
    );
    expect(packageManifest.exports).toMatchObject({
      "./structured-classification-request-schema":
        "./schemas/opsrabbit-structured-classification-request.schema.json",
      "./structured-classification-result-schema":
        "./schemas/opsrabbit-structured-classification-result.schema.json",
    });
    expect(packageManifest.files).toContain("schemas");
  });
});

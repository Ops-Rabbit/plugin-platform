import type { ValidationIssue } from "../contracts/errors.js";
import {
  STRUCTURED_CLASSIFICATION_LIMITS as LIMITS,
  STRUCTURED_CLASSIFICATION_SCHEMA_VERSION,
  type PluginStructuredClassificationInputV1,
} from "../contracts/structured-classification.js";

const KEY = /^[a-z][a-z0-9_]{0,79}$/u;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const encoder = new TextEncoder();

export function validateStructuredClassificationInput(
  input: unknown,
): ValidationIssue[] {
  if (!record(input)) return [issue("$", "type", "Input must be an object.")];
  const issues: ValidationIssue[] = [];
  exactKeys(
    input,
    [
      "schemaVersion",
      "content",
      "instructions",
      "classes",
      "evidence",
      "timeoutMs",
    ],
    "$",
    issues,
  );
  if (input.schemaVersion !== STRUCTURED_CLASSIFICATION_SCHEMA_VERSION)
    issues.push(
      issue(
        "$.schemaVersion",
        "unsupported",
        "Structured-classification schema version must be 1.",
      ),
    );
  boundedText(input.content, "$.content", LIMITS.maximumContentBytes, issues);
  boundedText(
    input.instructions,
    "$.instructions",
    LIMITS.maximumInstructionsBytes,
    issues,
  );
  if (
    !Number.isInteger(input.timeoutMs) ||
    Number(input.timeoutMs) < LIMITS.minimumTimeoutMs ||
    Number(input.timeoutMs) > LIMITS.maximumTimeoutMs
  )
    issues.push(
      issue(
        "$.timeoutMs",
        "limit",
        `timeoutMs must be between ${LIMITS.minimumTimeoutMs} and ${LIMITS.maximumTimeoutMs}.`,
      ),
    );
  if (
    !Array.isArray(input.classes) ||
    input.classes.length < 2 ||
    input.classes.length > LIMITS.maximumClasses
  )
    issues.push(
      issue(
        "$.classes",
        "limit",
        `Declare between 2 and ${LIMITS.maximumClasses} classes.`,
      ),
    );
  else {
    const keys = new Set<string>();
    input.classes.forEach((entry, index) => {
      const path = `$.classes[${index}]`;
      if (!record(entry))
        return void issues.push(
          issue(path, "type", "Class must be an object."),
        );
      exactKeys(
        entry,
        ["key", "label", "description", "qualificationRequirements"],
        path,
        issues,
      );
      if (typeof entry.key !== "string" || !KEY.test(entry.key))
        issues.push(
          issue(
            `${path}.key`,
            "invalid",
            "Class key must be stable lowercase snake_case.",
          ),
        );
      else if (keys.has(entry.key))
        issues.push(
          issue(`${path}.key`, "duplicate", "Class keys must be unique."),
        );
      else keys.add(entry.key);
      boundedText(entry.label, `${path}.label`, 160, issues);
      boundedText(entry.description, `${path}.description`, 2_000, issues);
      stringList(
        entry.qualificationRequirements,
        `${path}.qualificationRequirements`,
        1,
        LIMITS.maximumQualificationRequirements,
        1_000,
        issues,
      );
    });
  }
  if (
    !Array.isArray(input.evidence) ||
    input.evidence.length > LIMITS.maximumEvidenceItems
  )
    issues.push(
      issue(
        "$.evidence",
        "limit",
        `Declare at most ${LIMITS.maximumEvidenceItems} evidence items.`,
      ),
    );
  else {
    const ids = new Set<string>();
    input.evidence.forEach((entry, index) => {
      const path = `$.evidence[${index}]`;
      if (!record(entry))
        return void issues.push(
          issue(path, "type", "Evidence must be an object."),
        );
      exactKeys(entry, ["id", "text"], path, issues);
      if (typeof entry.id !== "string" || !REFERENCE.test(entry.id))
        issues.push(
          issue(
            `${path}.id`,
            "invalid",
            "Evidence id must be a bounded opaque reference.",
          ),
        );
      else if (ids.has(entry.id))
        issues.push(
          issue(`${path}.id`, "duplicate", "Evidence ids must be unique."),
        );
      else ids.add(entry.id);
      boundedText(
        entry.text,
        `${path}.text`,
        LIMITS.maximumEvidenceTextBytes,
        issues,
      );
    });
  }
  return issues;
}

export function validateStructuredClassificationResult(
  input: PluginStructuredClassificationInputV1,
  result: unknown,
): ValidationIssue[] {
  if (!record(result)) return [issue("$", "type", "Result must be an object.")];
  if (result.status === "timeout") {
    const issues: ValidationIssue[] = [];
    exactKeys(result, ["status"], "$", issues);
    return issues;
  }
  if (result.status === "unavailable") {
    const issues: ValidationIssue[] = [];
    exactKeys(result, ["status", "reason"], "$", issues);
    if (
      !["not_configured", "policy_blocked", "capacity_unavailable"].includes(
        String(result.reason),
      )
    )
      issues.push(
        issue("$.reason", "invalid", "Unavailable reason is not supported."),
      );
    return issues;
  }
  if (result.status !== "completed")
    return [
      issue(
        "$.status",
        "invalid",
        "Result status must be completed, timeout, or unavailable.",
      ),
    ];
  const issues: ValidationIssue[] = [];
  exactKeys(
    result,
    [
      "status",
      "recommendedClassKey",
      "confidence",
      "reason",
      "evidenceRefs",
      "missingEvidence",
    ],
    "$",
    issues,
  );
  const classKeys = new Set(input.classes.map((entry) => entry.key));
  if (
    typeof result.recommendedClassKey !== "string" ||
    !classKeys.has(result.recommendedClassKey)
  )
    issues.push(
      issue(
        "$.recommendedClassKey",
        "unknown-class",
        "Recommended class must be one of the supplied class keys.",
      ),
    );
  if (
    typeof result.confidence !== "number" ||
    !Number.isFinite(result.confidence) ||
    result.confidence < 0 ||
    result.confidence > 1
  )
    issues.push(
      issue("$.confidence", "invalid", "Confidence must be between 0 and 1."),
    );
  boundedText(result.reason, "$.reason", LIMITS.maximumReasonBytes, issues);
  const evidenceIds = new Set(input.evidence.map((entry) => entry.id));
  if (
    !Array.isArray(result.evidenceRefs) ||
    result.evidenceRefs.length > LIMITS.maximumEvidenceItems
  )
    issues.push(
      issue(
        "$.evidenceRefs",
        "limit",
        "Evidence references exceed the input limit.",
      ),
    );
  else if (
    new Set(result.evidenceRefs).size !== result.evidenceRefs.length ||
    result.evidenceRefs.some(
      (id) => typeof id !== "string" || !evidenceIds.has(id),
    )
  )
    issues.push(
      issue(
        "$.evidenceRefs",
        "provenance",
        "Evidence references must be unique ids supplied in the request.",
      ),
    );
  stringList(
    result.missingEvidence,
    "$.missingEvidence",
    0,
    LIMITS.maximumMissingEvidenceItems,
    1_000,
    issues,
  );
  return issues;
}

function boundedText(
  value: unknown,
  path: string,
  maxBytes: number,
  issues: ValidationIssue[],
): void {
  if (typeof value !== "string" || value.trim().length === 0)
    issues.push(issue(path, "required", "A non-empty string is required."));
  else if (encoder.encode(value).length > maxBytes)
    issues.push(issue(path, "limit", `Text exceeds ${maxBytes} bytes.`));
}
function stringList(
  value: unknown,
  path: string,
  min: number,
  max: number,
  maxBytes: number,
  issues: ValidationIssue[],
): void {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    return void issues.push(
      issue(
        path,
        "limit",
        `List must contain between ${min} and ${max} items.`,
      ),
    );
  value.forEach((entry, index) =>
    boundedText(entry, `${path}[${index}]`, maxBytes, issues),
  );
}
function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      issues.push(issue(`${path}.${key}`, "unknown", "Unknown property."));
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

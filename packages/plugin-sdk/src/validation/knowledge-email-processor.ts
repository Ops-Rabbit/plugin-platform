import type {
  KnowledgeEmailCandidatePostProcessInputV1,
  KnowledgeEmailCandidatePostProcessResultV1,
  KnowledgeEmailMessageInputV1,
  KnowledgeEmailMessageResultV1,
} from "../contracts/knowledge-email-processor.js";
import type { ValidationIssue } from "../contracts/errors.js";

export function validateKnowledgeEmailMessageResult(
  input: KnowledgeEmailMessageInputV1,
  result: KnowledgeEmailMessageResultV1,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!record(result) || !Array.isArray(result.sections))
    return [
      issue("$.sections", "type", "Processor sections must be an array."),
    ];
  if (result.sections.length > input.limits.maximumSections)
    issues.push(
      issue("$.sections", "limit", "Processor returned too many sections."),
    );
  const encoder = new TextEncoder();
  result.sections.forEach((section, index) => {
    const path = `$.sections[${index}]`;
    if (!record(section)) {
      issues.push(issue(path, "type", "Section must be an object."));
      return;
    }
    const offsets = section.sourceOffsets;
    if (
      !record(offsets) ||
      !Number.isInteger(offsets.start) ||
      !Number.isInteger(offsets.end) ||
      Number(offsets.start) < 0 ||
      Number(offsets.end) <= Number(offsets.start) ||
      Number(offsets.end) > input.evidenceText.length
    )
      issues.push(
        issue(
          `${path}.sourceOffsets`,
          "provenance",
          "Section offsets must identify evidence text.",
        ),
      );
    else if (
      input.evidenceText.slice(Number(offsets.start), Number(offsets.end)) !==
      section.sourceText
    )
      issues.push(
        issue(
          `${path}.sourceText`,
          "provenance",
          "Section sourceText must exactly match its evidence offsets.",
        ),
      );
    if (
      typeof section.sourceText !== "string" ||
      encoder.encode(section.sourceText).length >
        input.limits.maximumSectionBytes
    )
      issues.push(
        issue(
          `${path}.sourceText`,
          "limit",
          "Section source text exceeds its limit.",
        ),
      );
    if (
      typeof section.embeddingText !== "string" ||
      encoder.encode(section.embeddingText).length >
        input.limits.maximumEmbeddingTextBytes
    )
      issues.push(
        issue(
          `${path}.embeddingText`,
          "limit",
          "Section embedding text exceeds its limit.",
        ),
      );
    if (
      !boundedLabel(section.chunkType) ||
      !boundedLabel(section.resolutionStatus)
    )
      issues.push(
        issue(
          path,
          "invalid",
          "Section category and status must be bounded labels.",
        ),
      );
  });
  return issues;
}

export function validateKnowledgeEmailCandidateResult(
  input: KnowledgeEmailCandidatePostProcessInputV1,
  result: KnowledgeEmailCandidatePostProcessResultV1,
): ValidationIssue[] {
  if (!record(result) || !Array.isArray(result.orderedCandidateIds))
    return [
      issue(
        "$.orderedCandidateIds",
        "type",
        "Ordered candidate IDs must be an array.",
      ),
    ];
  const available = new Set(input.candidates.map(({ id }) => id));
  const ordered = result.orderedCandidateIds;
  const suppressed = result.suppressedCandidateIds ?? [];
  const issues: ValidationIssue[] = [];
  if (
    new Set(ordered).size !== ordered.length ||
    new Set(suppressed).size !== suppressed.length
  )
    issues.push(
      issue("$", "duplicate", "Candidate IDs must not be duplicated."),
    );
  if ([...ordered, ...suppressed].some((id) => !available.has(id)))
    issues.push(
      issue(
        "$",
        "unknown-candidate",
        "Processor output may contain only supplied candidate IDs.",
      ),
    );
  if (ordered.some((id) => suppressed.includes(id)))
    issues.push(
      issue("$", "conflict", "A candidate cannot be ordered and suppressed."),
    );
  if ((result.reasonCodes ?? []).some((value) => !boundedLabel(value)))
    issues.push(
      issue("$.reasonCodes", "invalid", "Reason codes must be bounded labels."),
    );
  return issues;
}

function boundedLabel(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,79}$/u.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

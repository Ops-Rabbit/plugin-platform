import { describe, expect, it } from "vitest";
import {
  validateKnowledgeEmailCandidateResult,
  validateKnowledgeEmailMessageResult,
} from "../src/validation/knowledge-email-processor.js";
import type { KnowledgeEmailProcessingContextV1 } from "../src/contracts/knowledge-email-processor.js";

const message = {
  sourceType: "imap_email" as const,
  mailbox: "support",
  folder: "INBOX",
  threadId: "t",
  messageId: "m",
  imapUid: "1",
  subject: "Issue",
  timestamp: null,
  evidenceText: "Check the certificate.",
  limits: {
    maximumSections: 2,
    maximumSectionBytes: 100,
    maximumEmbeddingTextBytes: 200,
  },
};

describe("Knowledge email processor validation", () => {
  it("exposes an optional host-managed LLM classifier in processing context", async () => {
    const classifyWithLlm = async () => ({
      chunkType: "problem",
      resolutionStatus: "unknown",
      confidence: 0.8,
    });
    const context: KnowledgeEmailProcessingContextV1 = {
      tenantId: "t",
      sourceId: "s",
      configRevision: "1",
      signal: new AbortController().signal,
      settings: {},
      classifyWithLlm,
    };
    if (!context.classifyWithLlm) throw new Error("Expected classifier.");
    await expect(
      context.classifyWithLlm({
        subject: "Issue",
        evidenceText: "Failed",
        instructions: "Classify",
        classes: [
          {
            id: "problem",
            description: "Failure",
            allowedResolutionStatuses: ["unknown"],
          },
        ],
      }),
    ).resolves.toMatchObject({ chunkType: "problem" });
  });
  it("accepts evidence-backed sections and rejects invented text", () => {
    expect(
      validateKnowledgeEmailMessageResult(message, {
        sections: [
          {
            sourceText: message.evidenceText,
            embeddingText: message.evidenceText,
            chunkType: "troubleshooting_step",
            resolutionStatus: "unknown",
            sourceOffsets: { start: 0, end: message.evidenceText.length },
          },
        ],
        processorVersion: "test/1",
        classificationSchemaVersion: 1,
      }),
    ).toEqual([]);
    expect(
      validateKnowledgeEmailMessageResult(message, {
        sections: [
          {
            sourceText: "Root cause confirmed.",
            embeddingText: "Root cause confirmed.",
            chunkType: "root_cause",
            resolutionStatus: "resolved",
            sourceOffsets: { start: 0, end: message.evidenceText.length },
          },
        ],
        processorVersion: "test/1",
        classificationSchemaVersion: 1,
      }),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "provenance" })]),
    );
  });

  it("allows only supplied candidate IDs", () => {
    const input = {
      query: "certificate",
      candidates: [
        {
          id: "a",
          score: 1,
          sourceText: "text",
          threadId: "t",
          messageId: "m",
          chunkType: "general_message",
          resolutionStatus: "unknown",
          metadata: {},
        },
      ],
    };
    expect(
      validateKnowledgeEmailCandidateResult(input, {
        orderedCandidateIds: ["a"],
      }),
    ).toEqual([]);
    expect(
      validateKnowledgeEmailCandidateResult(input, {
        orderedCandidateIds: ["other"],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown-candidate" }),
      ]),
    );
    expect(
      validateKnowledgeEmailCandidateResult(input, {
        orderedCandidateIds: ["a", "a"],
        suppressedCandidateIds: ["a", "a"],
        reasonCodes: ["Invalid reason"],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate" }),
        expect.objectContaining({ code: "conflict" }),
        expect.objectContaining({ path: "$.reasonCodes" }),
      ]),
    );
    expect(
      validateKnowledgeEmailCandidateResult(input, null as unknown as never),
    ).toEqual([expect.objectContaining({ code: "type" })]);
  });

  it("rejects malformed, excessive, and unbounded sections", () => {
    expect(
      validateKnowledgeEmailMessageResult(message, null as unknown as never),
    ).toEqual([expect.objectContaining({ code: "type" })]);
    const result = {
      sections: [
        null,
        {
          sourceText: "x".repeat(101),
          embeddingText: "x".repeat(201),
          chunkType: "Invalid type",
          resolutionStatus: "",
          sourceOffsets: { start: -1, end: 500 },
        },
        {
          sourceText: "Check",
          embeddingText: "Check",
          chunkType: "general_message",
          resolutionStatus: "unknown",
          sourceOffsets: { start: 0, end: 5 },
        },
      ],
      processorVersion: "test/1",
      classificationSchemaVersion: 1,
    };
    expect(
      validateKnowledgeEmailMessageResult(message, result as never),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.sections", code: "limit" }),
        expect.objectContaining({ path: "$.sections[0]", code: "type" }),
        expect.objectContaining({ code: "provenance" }),
        expect.objectContaining({ code: "invalid" }),
      ]),
    );
  });
});

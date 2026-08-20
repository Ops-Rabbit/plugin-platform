import type { JsonValue } from "./manifest.js";

export const KNOWLEDGE_EMAIL_PROCESSOR_SCHEMA_VERSION = "1" as const;

export type KnowledgeEmailChunkType = string;
export type KnowledgeEmailResolutionStatus = string;

export interface KnowledgeEmailProcessingContextV1 {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly configRevision: string;
  readonly signal: AbortSignal;
  readonly settings: Readonly<Record<string, JsonValue>>;
}

export interface KnowledgeEmailMessageInputV1 {
  readonly sourceType: "imap_email";
  readonly mailbox: string;
  readonly folder: string;
  readonly threadId: string;
  readonly messageId: string;
  readonly imapUid: string;
  readonly subject: string;
  readonly timestamp: string | null;
  readonly evidenceText: string;
  readonly limits: {
    readonly maximumSections: number;
    readonly maximumSectionBytes: number;
    readonly maximumEmbeddingTextBytes: number;
  };
}

export interface KnowledgeEmailSectionV1 {
  readonly sourceText: string;
  readonly embeddingText: string;
  readonly chunkType: KnowledgeEmailChunkType;
  readonly resolutionStatus: KnowledgeEmailResolutionStatus;
  readonly sourceOffsets: { readonly start: number; readonly end: number };
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface KnowledgeEmailMessageResultV1 {
  readonly sections: readonly KnowledgeEmailSectionV1[];
  readonly processorVersion: string;
  readonly classificationSchemaVersion: number;
}

export interface KnowledgeEmailCandidateV1 {
  readonly id: string;
  readonly score: number;
  readonly sourceText: string;
  readonly threadId: string;
  readonly messageId: string;
  readonly chunkType: string;
  readonly resolutionStatus: string;
  readonly metadata: Readonly<Record<string, JsonValue>>;
}

export interface KnowledgeEmailCandidatePostProcessInputV1 {
  readonly query: string;
  readonly candidates: readonly KnowledgeEmailCandidateV1[];
}

export interface KnowledgeEmailCandidatePostProcessResultV1 {
  readonly orderedCandidateIds: readonly string[];
  readonly suppressedCandidateIds?: readonly string[];
  readonly reasonCodes?: readonly string[];
}

export interface KnowledgeEmailProcessorDefinitionV1 {
  readonly schemaVersion: typeof KNOWLEDGE_EMAIL_PROCESSOR_SCHEMA_VERSION;
  processMessage(
    input: KnowledgeEmailMessageInputV1,
    context: KnowledgeEmailProcessingContextV1,
  ): Promise<KnowledgeEmailMessageResultV1>;
  postProcessCandidates(
    input: KnowledgeEmailCandidatePostProcessInputV1,
    context: KnowledgeEmailProcessingContextV1,
  ): Promise<KnowledgeEmailCandidatePostProcessResultV1>;
}

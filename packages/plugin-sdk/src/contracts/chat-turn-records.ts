export const CHAT_TURN_RECORDS_SCHEMA_VERSION = "1" as const;
/** Maximum turn ids accepted by one `getTurns` call. */
export const CHAT_TURN_RECORDS_MAX_TURN_IDS = 25;
/** Maximum Unicode code points of user message text returned per turn. */
export const CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH = 2000;
/** Maximum Unicode code points of an optional feedback comment returned per turn. */
export const CHAT_TURN_RECORDS_MAX_FEEDBACK_COMMENT_LENGTH = 2000;
/** Maximum `getTurns` calls a host allows in one route invocation (one page of up to 100 rows). */
export const CHAT_TURN_RECORDS_CALLS_PER_INVOCATION = 4;

/**
 * HTTP-style statuses a host uses when `getTurns` fails. Plugins can tell a malformed request
 * (their bug) from an exhausted per-invocation budget and from a host fault.
 */
export const CHAT_TURN_RECORDS_ERROR_STATUS = {
  invalidRequest: 400,
  readLimitExceeded: 429,
  hostContractViolation: 500,
} as const;

/** Shape of a `getTurns` rejection. `status` is one of `CHAT_TURN_RECORDS_ERROR_STATUS`. */
export interface ChatTurnRecordsErrorV1 extends Error {
  readonly status: (typeof CHAT_TURN_RECORDS_ERROR_STATUS)[keyof typeof CHAT_TURN_RECORDS_ERROR_STATUS];
}

export type ChatTurnFeedbackV1 = "thumbs_up" | "thumbs_down";

/**
 * Host-owned facts for one signed-in chat turn that this plugin admitted through
 * `chatTurnAdmission`. Records are read on demand and must not be copied into plugin storage.
 */
export interface ChatTurnRecordV1 {
  readonly turnId: string;
  readonly threadId: string;
  /**
   * The user's question, bounded to `CHAT_TURN_RECORDS_MAX_MESSAGE_LENGTH` code points. Null
   * when the turn still exists but its question message or author has been deleted.
   */
  readonly userMessage: string | null;
  /** True only when `userMessage` was cut to the bound; always false when it is null. */
  readonly userMessageTruncated: boolean;
  /** The current feedback on the assistant answer for this turn, if any. */
  readonly feedback: ChatTurnFeedbackV1 | null;
  /**
   * UTC timestamp of that feedback, `YYYY-MM-DDTHH:MM:SS[.fraction]Z` (1-9 fraction digits); null
   * exactly when `feedback` is null.
   */
  readonly feedbackUpdatedAt: string | null;
  /**
   * The optional comment the user wrote with that feedback, at most
   * `CHAT_TURN_RECORDS_MAX_FEEDBACK_COMMENT_LENGTH` code points and never empty. Null when the
   * feedback has no comment, and always null when `feedback` is null. Absent when the host does
   * not supply comments, so a plugin must treat a missing field like null.
   */
  readonly feedbackComment?: string | null;
}

export interface ChatTurnRecordsRequestV1 {
  readonly turnIds: readonly string[];
}

export interface ChatTurnRecordsResultV1 {
  /**
   * One record per requested turn that still exists and that this plugin admitted, in request
   * order. Unknown, deleted, and other plugins' turns are omitted indistinguishably.
   */
  readonly turns: readonly ChatTurnRecordV1[];
}

/**
 * Deployment-admin-only, read-only broker for turns admitted through `chatTurnAdmission`.
 * Available only to `requiredRole: "admin"` workspace routes, never to actions, jobs, or tools.
 * Hosts audit every successful read and never expose assistant output, attachments, thinking, or metadata
 * other than the feedback comment.
 */
export interface PluginChatTurnRecordsService {
  getTurns(input: ChatTurnRecordsRequestV1): Promise<ChatTurnRecordsResultV1>;
}

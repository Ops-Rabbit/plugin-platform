export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}

export class PluginValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(
      `Plugin validation failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}`,
    );
    this.name = "PluginValidationError";
    this.issues = issues;
  }
}

/** Stable, user-safe failure from a plugin action boundary. */
export class PluginActionError extends Error {
  readonly status: 400 | 409 | 410 | 422;
  readonly code: string;

  constructor(status: 400 | 409 | 410 | 422, code: string, message: string) {
    super(message);
    this.name = "PluginActionError";
    this.status = status;
    this.code = code;
  }
}

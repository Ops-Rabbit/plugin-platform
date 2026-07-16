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

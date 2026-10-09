/** Plain partial output from an executing tool; never a final result or UI action. */
export interface PluginToolUpdate {
  readonly text: string;
}

/** Optional execution-scoped sink. Older hosts may omit it. */
export type PluginToolUpdateCallback = (update: PluginToolUpdate) => void;

export const PLUGIN_TOOL_UPDATE_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: {
    text: { type: "string", minLength: 1, maxLength: 4096, pattern: "\\S" },
  },
} as const;

export function isPluginToolUpdate(value: unknown): value is PluginToolUpdate {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const update = value as Record<string, unknown>;
  return (
    Object.keys(update).every((key) => key === "text") &&
    typeof update.text === "string" &&
    /\S/u.test(update.text) &&
    Array.from(update.text).length <= 4096
  );
}

export function validatePluginToolUpdate(value: unknown): void {
  if (!isPluginToolUpdate(value))
    throw new TypeError(
      "Plugin tool update must contain only nonblank text of at most 4096 Unicode code points.",
    );
}

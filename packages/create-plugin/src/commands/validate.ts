import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateManifest,
  type PluginManifest,
  type ValidationIssue,
} from "@opsrabbit/plugin-sdk";

export interface ValidationReport {
  manifest?: PluginManifest;
  issues: ValidationIssue[];
}

export async function validatePluginDirectory(
  directory = process.cwd(),
): Promise<ValidationReport> {
  const manifestPath = resolve(directory, "opsrabbit.plugin.json");
  let input: unknown;
  try {
    input = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    return {
      issues: [
        { path: "$", code: "manifest-read", message: readableError(error) },
      ],
    };
  }
  const result = validateManifest(input);
  if (!result.ok || !result.value) return { issues: result.issues };
  return { manifest: result.value, issues: [] };
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

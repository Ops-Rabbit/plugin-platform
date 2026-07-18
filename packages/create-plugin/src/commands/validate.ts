import { lstat, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateFormStarterPack,
  validateManifest,
  type PluginManifest,
  type ValidationIssue,
} from "@opsrabbit/plugin-sdk";

export interface ValidationReport {
  manifest?: PluginManifest;
  issues: ValidationIssue[];
}

const MAX_STARTER_PACK_BYTES = 1024 * 1024;

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
  const issues = [
    ...(await validateReferencedStarterPack(directory, result.value)),
    ...(await validateReferencedMigrations(directory, result.value)),
  ];
  return { manifest: result.value, issues };
}

async function validateReferencedMigrations(
  directory: string,
  manifest: PluginManifest,
): Promise<ValidationIssue[]> {
  if (!manifest.database) return [];
  const root = resolve(directory, manifest.database.migrationsPath);
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
      return [
        migrationIssue(
          "asset-type",
          "Migrations path must be a regular directory.",
        ),
      ];
    const entries = await readdir(root, { withFileTypes: true });
    if (entries.length === 0)
      return [
        migrationIssue(
          "asset-empty",
          "Migrations directory must contain SQL files.",
        ),
      ];
    const issues: ValidationIssue[] = [];
    let totalBytes = 0;
    for (const entry of entries) {
      const path = resolve(root, entry.name);
      const stat = await lstat(path);
      if (
        !entry.isFile() ||
        stat.isSymbolicLink() ||
        !/^\d{4}_[a-z][a-z0-9_]*\.sql$/.test(entry.name)
      ) {
        issues.push(
          migrationIssue(
            "asset-entry",
            `Invalid migration file: ${entry.name}.`,
          ),
        );
        continue;
      }
      totalBytes += stat.size;
    }
    if (totalBytes > 1024 * 1024)
      issues.push(
        migrationIssue(
          "asset-size",
          "Migration assets exceed the 1 MiB limit.",
        ),
      );
    return issues;
  } catch (error) {
    return [migrationIssue("asset-read", readableError(error))];
  }
}

function migrationIssue(code: string, message: string): ValidationIssue {
  return { path: "$.database.migrationsPath", code, message };
}

async function validateReferencedStarterPack(
  directory: string,
  manifest: PluginManifest,
): Promise<ValidationIssue[]> {
  const reference = manifest.formStarterPack;
  if (!reference) return [];
  const path = resolve(directory, reference.path);
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return [
        starterPackIssue("asset-type", "Starter pack must be a regular file."),
      ];
    }
    if (stat.size > MAX_STARTER_PACK_BYTES) {
      return [
        starterPackIssue(
          "asset-size",
          `Starter pack exceeds the ${MAX_STARTER_PACK_BYTES}-byte limit.`,
        ),
      ];
    }
    const input = JSON.parse(await readFile(path, "utf8")) as unknown;
    const result = validateFormStarterPack(input);
    const issues = result.issues.map((entry) => ({
      ...entry,
      path: `$.formStarterPack.asset${entry.path.slice(1)}`,
    }));
    if (result.value?.moduleKey !== reference.moduleKey) {
      issues.push(
        starterPackIssue(
          "module-mismatch",
          "Starter-pack asset and manifest module keys must match.",
          "$.formStarterPack.asset.moduleKey",
        ),
      );
    }
    const rootStarterKey = manifest.navigation?.workflow?.rootStarterKey;
    if (
      rootStarterKey &&
      result.value &&
      !result.value.starters.some(
        (starter) => starter.starterKey === rootStarterKey,
      )
    ) {
      issues.push(
        starterPackIssue(
          "workflow-root-missing",
          "Workflow rootStarterKey must name a starter in the referenced asset.",
          "$.navigation.workflow.rootStarterKey",
        ),
      );
    }
    return issues;
  } catch (error) {
    return [starterPackIssue("asset-read", readableError(error))];
  }
}

function starterPackIssue(
  code: string,
  message: string,
  path = "$.formStarterPack.path",
): ValidationIssue {
  return { path, code, message };
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

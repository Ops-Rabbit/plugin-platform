import { access, lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  validateRegistration,
  type PluginDefinition,
  type ValidationIssue,
} from "@opsrabbit/plugin-sdk";
import { validatePluginDirectory } from "./validate.js";

export async function checkPluginDirectory(
  directory = process.cwd(),
): Promise<ValidationIssue[]> {
  const report = await validatePluginDirectory(directory);
  if (!report.manifest) return report.issues;
  const issues = [...report.issues];
  const entry = resolve(directory, report.manifest.main);
  let entryStat;
  try {
    entryStat = await lstat(entry);
  } catch {
    issues.push({
      path: "$.main",
      code: "missing-entry",
      message: `Build output does not exist: ${report.manifest.main}`,
    });
  }
  if (entryStat) {
    if (!entryStat.isFile() || entryStat.isSymbolicLink()) {
      issues.push({
        path: "$.main",
        code: "invalid-entry",
        message: "Compiled entry must be a regular file.",
      });
    }
    if (entryStat.isFile() && !entryStat.isSymbolicLink()) {
      try {
        const imported = (await import(
          `${pathToFileURL(entry).href}?check=${entryStat.mtimeMs}`
        )) as { default?: PluginDefinition } & PluginDefinition;
        const definition = imported.default ?? imported;
        if (!definition || typeof definition !== "object") {
          issues.push({
            path: "$.main",
            code: "invalid-entry",
            message: "Compiled entry must export a plugin definition object.",
          });
        } else {
          issues.push(...validateRegistration(report.manifest, definition));
        }
      } catch (error) {
        issues.push({
          path: "$.main",
          code: "entry-load",
          message: `Compiled entry could not be loaded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }
  }
  for (const required of ["package.json", "README.md", "LICENSE", "NOTICE"]) {
    try {
      await access(resolve(directory, required));
    } catch {
      issues.push({
        path: `$.files.${required}`,
        code: "missing-file",
        message: `${required} is required in a release.`,
      });
    }
  }
  try {
    const packageJson = JSON.parse(
      await readFile(resolve(directory, "package.json"), "utf8"),
    ) as { name?: unknown; version?: unknown };
    if (packageJson.version !== report.manifest.version) {
      issues.push({
        path: "$.version",
        code: "version-mismatch",
        message: "package.json and manifest versions must match.",
      });
    }
  } catch (error) {
    issues.push({
      path: "$.files.package.json",
      code: "invalid-package",
      message:
        error instanceof Error
          ? error.message
          : "package.json could not be read.",
    });
  }
  return issues;
}

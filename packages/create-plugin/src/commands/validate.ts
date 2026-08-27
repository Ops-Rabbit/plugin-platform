import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
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
    ...(await validateReferencedFrontend(directory, result.value)),
    ...(await validateReferencedLocalization(directory, result.value)),
  ];
  return { manifest: result.value, issues };
}

const MAX_LOCALIZATION_FILE_BYTES = 256 * 1024;
const MAX_LOCALIZATION_AGGREGATE_BYTES = 1024 * 1024;

async function validateReferencedLocalization(
  directory: string,
  manifest: PluginManifest,
): Promise<ValidationIssue[]> {
  if (!manifest.localization) return [];
  const issues: ValidationIssue[] = [];
  const root = resolve(directory, manifest.localization.path);
  const expected = new Set(
    manifest.localization.supportedLocales.map((locale) =>
      relative(directory, resolve(root, `${locale}.json`))
        .split(sep)
        .join("/"),
    ),
  );
  try {
    await rejectSymlinkSegments(directory, root);
    const actual = await listRegularFiles(root, directory);
    for (const file of actual)
      if (!expected.has(file))
        issues.push({
          path: "$.localization.path",
          code: "undeclared-asset",
          message: `Undeclared localization asset: ${file}.`,
        });
  } catch (error) {
    issues.push({
      path: "$.localization.path",
      code: "asset-read",
      message: readableError(error),
    });
    return issues;
  }
  const requiredKeys = localizationKeys(manifest);
  let aggregateBytes = 0;
  for (const locale of manifest.localization.supportedLocales) {
    const path = resolve(root, `${locale}.json`);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("Localization bundle must be a regular file.");
      aggregateBytes += stat.size;
      if (stat.size > MAX_LOCALIZATION_FILE_BYTES)
        issues.push({
          path: `$.localization.bundle[${JSON.stringify(locale)}]`,
          code: "asset-size",
          message: `Localization bundle exceeds ${MAX_LOCALIZATION_FILE_BYTES} bytes.`,
        });
      const bundle = JSON.parse(await readFile(path, "utf8")) as unknown;
      if (
        !bundle ||
        typeof bundle !== "object" ||
        Array.isArray(bundle) ||
        Object.values(bundle).some((entry) => typeof entry !== "string")
      )
        issues.push({
          path: `$.localization.bundle[${JSON.stringify(locale)}]`,
          code: "invalid",
          message:
            "Localization bundle must be a JSON object with string values.",
        });
      else
        for (const key of requiredKeys)
          if (!Object.hasOwn(bundle, key))
            issues.push({
              path: `$.localization.bundle[${JSON.stringify(locale)}]`,
              code: "missing-key",
              message: `Localization bundle is missing ${key}.`,
            });
    } catch (error) {
      issues.push({
        path: `$.localization.bundle[${JSON.stringify(locale)}]`,
        code: "asset-read",
        message: readableError(error),
      });
    }
  }
  if (aggregateBytes > MAX_LOCALIZATION_AGGREGATE_BYTES)
    issues.push({
      path: "$.localization.path",
      code: "assets-size",
      message: `Localization bundles exceed ${MAX_LOCALIZATION_AGGREGATE_BYTES} aggregate bytes.`,
    });
  return issues;
}

async function rejectSymlinkSegments(
  packageRoot: string,
  target: string,
): Promise<void> {
  let current = resolve(packageRoot);
  for (const segment of relative(packageRoot, target)
    .split(sep)
    .filter(Boolean)) {
    current = join(current, segment);
    if ((await lstat(current)).isSymbolicLink())
      throw new Error(`Symbolic links are not permitted: ${current}`);
  }
}

function localizationKeys(manifest: PluginManifest): Set<string> {
  const keys = new Set<string>();
  const workspace = manifest.adminWorkspace;
  if (!workspace) return keys;
  keys.add(workspace.titleKey);
  if (workspace.descriptionKey) keys.add(workspace.descriptionKey);
  for (const table of workspace.tables) {
    keys.add(table.titleKey);
    for (const column of table.columns) keys.add(column.labelKey);
    for (const action of table.rowActions ?? []) {
      keys.add(action.labelKey);
      for (const field of action.fields ?? []) {
        keys.add(field.labelKey);
        for (const option of field.options ?? []) keys.add(option.labelKey);
      }
    }
  }
  return keys;
}

const MAX_FRONTEND_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FRONTEND_AGGREGATE_BYTES = 20 * 1024 * 1024;

async function validateReferencedFrontend(
  directory: string,
  manifest: PluginManifest,
): Promise<ValidationIssue[]> {
  const frontend = manifest.frontend;
  if (!frontend) return [];
  const paths = new Set<string>([frontend.entry, ...frontend.styles]);
  const issues: ValidationIssue[] = [];
  try {
    const main = manifest.main.replace(/^\.\//u, "");
    const entry = frontend.entry.replace(/^\.\//u, "");
    for (const relativePath of await listRegularFiles(
      resolve(directory, "dist"),
      directory,
    )) {
      if (
        relativePath.endsWith(".js") &&
        relativePath !== main &&
        relativePath !== entry
      )
        issues.push(
          frontendIssue(
            "executable-undeclared",
            "Frontend JavaScript entry points must be explicitly declared.",
            `./${relativePath}`,
          ),
        );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      issues.push(frontendIssue("asset-read", readableError(error), "./dist"));
  }
  for (const asset of frontend.assets) {
    const prefix = asset.slice(2, -2);
    const root = resolve(directory, prefix);
    try {
      for (const relativePath of await listRegularFiles(root, directory))
        paths.add(`./${relativePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        return [frontendIssue("asset-read", readableError(error), asset)];
    }
  }
  let aggregateBytes = 0;
  for (const relativePath of paths) {
    const path = resolve(directory, relativePath);
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        issues.push(
          frontendIssue(
            "asset-type",
            "Frontend assets must be regular files.",
            relativePath,
          ),
        );
        continue;
      }
      if (relativePath.endsWith(".map")) {
        issues.push(
          frontendIssue(
            "source-map",
            "Frontend source maps are not published by default.",
            relativePath,
          ),
        );
      }
      aggregateBytes += stat.size;
      if (stat.size > MAX_FRONTEND_FILE_BYTES)
        issues.push(
          frontendIssue(
            "asset-size",
            `Frontend file exceeds ${MAX_FRONTEND_FILE_BYTES} bytes.`,
            relativePath,
          ),
        );
    } catch (error) {
      issues.push(
        frontendIssue("asset-read", readableError(error), relativePath),
      );
    }
  }
  if (aggregateBytes > MAX_FRONTEND_AGGREGATE_BYTES)
    issues.push(
      frontendIssue(
        "assets-size",
        `Frontend files exceed ${MAX_FRONTEND_AGGREGATE_BYTES} aggregate bytes.`,
        "$.frontend",
      ),
    );
  return issues;
}

async function listRegularFiles(
  directory: string,
  packageRoot: string,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symbolic links are not permitted: ${path}`);
    if (entry.isDirectory())
      paths.push(...(await listRegularFiles(path, packageRoot)));
    else if (entry.isFile())
      paths.push(
        path
          .slice(resolve(packageRoot).length + 1)
          .split("\\")
          .join("/"),
      );
    else throw new Error(`Frontend asset is not a regular file: ${path}`);
  }
  return paths;
}

function frontendIssue(
  code: string,
  message: string,
  path: string,
): ValidationIssue {
  return {
    path: path.startsWith("$.")
      ? path
      : `$.frontend.asset[${JSON.stringify(path)}]`,
    code,
    message,
  };
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
    const sqlTags = new Set<string>();
    for (const entry of entries) {
      if (entry.name === "meta") continue;
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
      sqlTags.add(entry.name.slice(0, -4));
    }
    issues.push(...(await validateMigrationJournal(root, sqlTags)));
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

async function validateMigrationJournal(
  root: string,
  sqlTags: Set<string>,
): Promise<ValidationIssue[]> {
  const journalPath = resolve(root, "meta", "_journal.json");
  try {
    const stat = await lstat(journalPath);
    if (!stat.isFile() || stat.isSymbolicLink())
      return [
        migrationIssue(
          "journal-type",
          "Drizzle journal must be a regular file.",
        ),
      ];
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as unknown;
    if (
      !journal ||
      typeof journal !== "object" ||
      !Array.isArray((journal as { entries?: unknown }).entries)
    )
      return [
        migrationIssue(
          "journal-entries",
          "Drizzle journal must contain an entries array.",
        ),
      ];
    const journalTags = new Set<string>();
    for (const entry of (journal as { entries: unknown[] }).entries) {
      const tag =
        entry &&
        typeof entry === "object" &&
        typeof (entry as { tag?: unknown }).tag === "string"
          ? (entry as { tag: string }).tag.trim()
          : "";
      if (
        !tag ||
        journalTags.has(tag) ||
        !/^[0-9]{4}_[a-z][a-z0-9_]*$/.test(tag)
      )
        return [
          migrationIssue(
            "journal-tag",
            "Drizzle journal contains an invalid or duplicate tag.",
          ),
        ];
      journalTags.add(tag);
    }
    if (
      journalTags.size !== sqlTags.size ||
      [...journalTags].some((tag) => !sqlTags.has(tag))
    )
      return [
        migrationIssue(
          "journal-files",
          "Drizzle journal entries must match the migration SQL files.",
        ),
      ];
    return [];
  } catch (error) {
    return [migrationIssue("journal-read", readableError(error))];
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

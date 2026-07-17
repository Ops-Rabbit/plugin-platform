import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { strToU8, zipSync, type Zippable } from "fflate";
import { checkPluginDirectory } from "./check.js";
import { validatePluginDirectory } from "./validate.js";

const INCLUDED_ROOTS = [
  "opsrabbit.plugin.json",
  "package.json",
  "README.md",
  "LICENSE",
  "NOTICE",
  "dist",
  "migrations",
];

export async function packPlugin(
  directory = process.cwd(),
  outputDirectory = resolve(directory, "release"),
): Promise<string> {
  const issues = await checkPluginDirectory(directory);
  if (issues.length > 0)
    throw new Error(
      issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"),
    );
  const report = await validatePluginDirectory(directory);
  if (!report.manifest)
    throw new Error("Manifest disappeared during packaging.");

  const archive: Zippable = {};
  for (const root of INCLUDED_ROOTS) {
    const path = resolve(directory, root);
    if (await isPresent(path))
      await addToArchive(archive, resolve(directory), path);
  }
  if (report.manifest.formStarterPack) {
    await addToArchive(
      archive,
      resolve(directory),
      resolve(directory, report.manifest.formStarterPack.path),
    );
  }
  await mkdir(outputDirectory, { recursive: true });
  const output = resolve(
    outputDirectory,
    `${report.manifest.id}-${report.manifest.version}.zip`,
  );
  await writeFile(output, zipSync(archive, { level: 9 }));
  return output;
}

async function addToArchive(
  archive: Zippable,
  root: string,
  path: string,
): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink())
    throw new Error(
      `Symbolic links are not permitted: ${relative(root, path)}`,
    );
  if (info.isDirectory()) {
    for (const entry of (await readdir(path)).sort())
      await addToArchive(archive, root, join(path, entry));
    return;
  }
  if (!info.isFile()) return;
  const name = relative(root, path).split(sep).join("/");
  archive[name] = [
    strToU8(await readFile(path, "utf8")),
    { mtime: new Date("1980-01-01T00:00:00.000Z") },
  ];
}

async function isPresent(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

export function releaseFileName(pluginId: string, version: string): string {
  return basename(`${pluginId}-${version}.zip`);
}

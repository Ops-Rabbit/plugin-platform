import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { StarterId } from "../constants.js";

export interface PlannedFile {
  path: string;
  content: string;
}

export async function createFilePlan(
  starter: StarterId,
): Promise<PlannedFile[]> {
  const assets = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "assets",
  );
  const roots = [join(assets, "common"), join(assets, "starters", starter)];
  const files: PlannedFile[] = [];
  for (const root of roots) {
    for (const absolute of await walk(root)) {
      const sourcePath = relative(root, absolute);
      files.push({
        path: sourcePath.endsWith(".tmpl")
          ? sourcePath.slice(0, -5)
          : sourcePath,
        content: await readFile(absolute, "utf8"),
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

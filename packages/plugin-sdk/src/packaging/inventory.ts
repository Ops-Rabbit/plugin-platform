import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export interface InventoryEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export async function createPackageInventory(
  root: string,
): Promise<InventoryEntry[]> {
  const absoluteRoot = resolve(root);
  const files = await walk(absoluteRoot);
  return Promise.all(
    files.sort().map(async (file) => {
      const content = await readFile(file);
      return {
        path: relative(absoluteRoot, file).split(sep).join("/"),
        bytes: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
      };
    }),
  );
}

export function digestInventory(entries: readonly InventoryEntry[]): string {
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
    else if (entry.isSymbolicLink())
      throw new Error(
        `Symbolic links are not permitted in package inventories: ${path}`,
      );
  }
  return files;
}

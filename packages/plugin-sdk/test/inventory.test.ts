import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPackageInventory,
  digestInventory,
} from "../src/packaging/inventory.js";

describe("package inventory", () => {
  it("sorts files, normalizes paths, and produces stable digests", async () => {
    const root = await mkdtemp(join(tmpdir(), "opsrabbit-inventory-"));
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "z.txt"), "z");
    await writeFile(join(root, "nested", "a.txt"), "a");
    const inventory = await createPackageInventory(root);
    expect(inventory.map(({ path }) => path)).toEqual([
      "nested/a.txt",
      "z.txt",
    ]);
    expect(digestInventory(inventory)).toHaveLength(64);
    expect(digestInventory(inventory)).toBe(digestInventory(inventory));
  });

  it("rejects symbolic links", async () => {
    const root = await mkdtemp(join(tmpdir(), "opsrabbit-inventory-link-"));
    const target = join(root, "target.txt");
    await writeFile(target, "target");
    await symlink(target, join(root, "link.txt"));
    await expect(createPackageInventory(root)).rejects.toThrow(
      "Symbolic links are not permitted",
    );
  });
});

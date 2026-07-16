import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkPluginDirectory } from "../src/commands/check.js";
import { createPlugin } from "../src/commands/create.js";
import { validatePluginDirectory } from "../src/commands/validate.js";

async function preparedPlugin(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "opsrabbit-check-"));
  const target = join(parent, "valid");
  await createPlugin({
    name: "Valid",
    starter: "basic-readonly",
    output: target,
  });
  await mkdir(join(target, "dist"));
  await writeFile(join(target, "dist", "index.js"), "export default {};\n");
  return target;
}

describe("plugin directory validation", () => {
  it("reports malformed and missing manifests", async () => {
    const root = await mkdtemp(join(tmpdir(), "opsrabbit-invalid-"));
    expect((await validatePluginDirectory(root)).issues[0]?.code).toBe(
      "manifest-read",
    );
    await writeFile(join(root, "opsrabbit.plugin.json"), "{");
    expect((await validatePluginDirectory(root)).issues[0]?.code).toBe(
      "manifest-read",
    );
  });

  it("checks a complete built plugin", async () => {
    expect(await checkPluginDirectory(await preparedPlugin())).toEqual([]);
  });

  it("reports missing build output and version mismatch", async () => {
    const parent = await mkdtemp(join(tmpdir(), "opsrabbit-unbuilt-"));
    const target = join(parent, "unbuilt");
    await createPlugin({
      name: "Unbuilt",
      starter: "basic-readonly",
      output: target,
    });
    const packagePath = join(target, "package.json");
    const packageJson = JSON.parse(
      await (await import("node:fs/promises")).readFile(packagePath, "utf8"),
    ) as Record<string, unknown>;
    await writeFile(
      packagePath,
      JSON.stringify({ ...packageJson, version: "9.9.9" }),
    );
    const codes = (await checkPluginDirectory(target)).map(({ code }) => code);
    expect(codes).toEqual(
      expect.arrayContaining(["missing-entry", "version-mismatch"]),
    );
  });

  it("rejects a symlinked compiled entry", async () => {
    const target = await preparedPlugin();
    const other = join(target, "other.js");
    await writeFile(other, "export default {}");
    await chmod(join(target, "dist", "index.js"), 0o644);
    await (
      await import("node:fs/promises")
    ).unlink(join(target, "dist", "index.js"));
    await symlink(other, join(target, "dist", "index.js"));
    expect(await checkPluginDirectory(target)).toContainEqual(
      expect.objectContaining({ code: "invalid-entry" }),
    );
  });

  it("reports missing release files and malformed package metadata", async () => {
    const target = await preparedPlugin();
    await rm(join(target, "README.md"));
    await writeFile(join(target, "package.json"), "{");
    const issues = await checkPluginDirectory(target);
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "missing-file" }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ code: "invalid-package" }),
    );
  });
});

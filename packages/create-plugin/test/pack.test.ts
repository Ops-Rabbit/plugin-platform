import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createPlugin } from "../src/commands/create.js";
import { packPlugin, releaseFileName } from "../src/commands/pack.js";

async function builtPlugin(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "opsrabbit-pack-"));
  const target = join(parent, "pack-me");
  await createPlugin({
    name: "Pack Me",
    starter: "basic-readonly",
    output: target,
  });
  await mkdir(join(target, "dist"));
  await writeFile(
    join(target, "dist", "index.js"),
    `export default { tools: [{ id: "status-summary", description: "Status", risk: "read", audience: "all", requiredPermission: "read", async run() { return null; } }] };\n`,
  );
  return target;
}

describe("packPlugin", () => {
  it("creates a bounded deterministic archive", async () => {
    const target = await builtPlugin();
    await writeFile(join(target, ".env"), "SECRET=do-not-package");
    const first = await packPlugin(target, join(target, "release-a"));
    const second = await packPlugin(target, join(target, "release-b"));
    const firstBytes = await readFile(first);
    expect(firstBytes).toEqual(await readFile(second));
    const files = Object.keys(unzipSync(firstBytes));
    expect(files).toContain("opsrabbit.plugin.json");
    expect(files).toContain("dist/index.js");
    expect(files).not.toContain(".env");
  });

  it("rejects symlinks in included directories", async () => {
    const target = await builtPlugin();
    await symlink(join(target, "README.md"), join(target, "dist", "linked.js"));
    await expect(packPlugin(target)).rejects.toThrow(
      "Symbolic links are not permitted",
    );
  });

  it("formats release names safely", () =>
    expect(releaseFileName("plugin", "1.2.3")).toBe("plugin-1.2.3.zip"));
});

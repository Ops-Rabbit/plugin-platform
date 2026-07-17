import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPlugin } from "../src/commands/create.js";
import { preparePluginRelease } from "../src/commands/release.js";

async function releasablePlugin(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "opsrabbit-release-"));
  const target = join(parent, "release-me");
  await createPlugin({
    name: "Release Me",
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

describe("preparePluginRelease", () => {
  it("creates a verifiable release set with an SPDX inventory", async () => {
    const target = await releasablePlugin();
    const artifacts = await preparePluginRelease({
      directory: target,
      tag: "v0.1.0",
    });
    expect(artifacts.map((path) => basename(path))).toEqual([
      "release-me-0.1.0.zip",
      "release-me-0.1.0.zip.sha256",
      "release-me-0.1.0.spdx.json",
      "release-me-0.1.0.release.json",
    ]);

    const archive = await readFile(artifacts[0]!);
    const digest = createHash("sha256").update(archive).digest("hex");
    expect(await readFile(artifacts[1]!, "utf8")).toBe(
      `${digest}  release-me-0.1.0.zip\n`,
    );
    const sbom = JSON.parse(await readFile(artifacts[2]!, "utf8")) as {
      spdxVersion: string;
      files: Array<{ fileName: string }>;
    };
    expect(sbom.spdxVersion).toBe("SPDX-2.3");
    expect(sbom.files.map((file) => file.fileName)).toContain(
      "./opsrabbit.plugin.json",
    );
    expect(JSON.parse(await readFile(artifacts[3]!, "utf8"))).toMatchObject({
      pluginId: "release-me",
      pluginVersion: "0.1.0",
      tag: "v0.1.0",
      sha256: digest,
    });
  });

  it("rejects a tag that does not match the plugin version", async () => {
    const target = await releasablePlugin();
    await expect(
      preparePluginRelease({ directory: target, tag: "v0.2.0" }),
    ).rejects.toThrow("must exactly match plugin version tag v0.1.0");
  });

  it("rejects divergent package and manifest versions", async () => {
    const target = await releasablePlugin();
    const packagePath = join(target, "package.json");
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      version: string;
    };
    await writeFile(
      packagePath,
      `${JSON.stringify({ ...packageJson, version: "0.1.1" }, null, 2)}\n`,
    );
    await expect(preparePluginRelease({ directory: target })).rejects.toThrow(
      "package.json version 0.1.1 must match plugin version 0.1.0",
    );
  });
});

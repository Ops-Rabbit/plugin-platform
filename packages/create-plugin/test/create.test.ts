import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STARTER_IDS } from "../src/constants.js";
import { createPlugin } from "../src/commands/create.js";

describe("createPlugin", () => {
  it.each(STARTER_IDS)("creates a complete %s repository", async (starter) => {
    const parent = await mkdtemp(join(tmpdir(), "opsrabbit-create-"));
    const target = join(parent, starter);
    await createPlugin({ name: `Example ${starter}`, starter, output: target });
    const manifest = JSON.parse(
      await readFile(join(target, "opsrabbit.plugin.json"), "utf8"),
    ) as { id: string };
    expect(manifest.id).toBe(`example-${starter}`);
    expect(
      await readFile(join(target, "src", "index.ts"), "utf8"),
    ).not.toContain("{{");
    expect(
      await readFile(join(target, "test", "plugin.test.ts"), "utf8"),
    ).not.toContain("{{");
    expect(await readFile(join(target, "AGENTS.md"), "utf8")).toContain(
      "Required boundaries",
    );
    expect(
      await readFile(
        join(target, ".github", "workflows", "plugin-ci.yml"),
        "utf8",
      ),
    ).toContain("test:coverage");
    const releaseWorkflow = await readFile(
      join(target, ".github", "workflows", "plugin-release.yml"),
      "utf8",
    );
    expect(releaseWorkflow).toContain("actions/attest-build-provenance");
    expect(releaseWorkflow).toContain(
      'run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
    );
    expect(releaseWorkflow).toContain("persist-credentials: false");
    expect(await readFile(join(target, "README.md"), "utf8")).toContain(
      "git push origin v1.2.3",
    );
  });

  it("refuses to overwrite a target", async () => {
    const target = await mkdtemp(join(tmpdir(), "opsrabbit-existing-"));
    await expect(
      createPlugin({
        name: "Existing",
        starter: "basic-readonly",
        output: target,
      }),
    ).rejects.toThrow("already exists");
  });
});

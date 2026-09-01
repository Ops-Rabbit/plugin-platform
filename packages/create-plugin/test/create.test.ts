import { execFileSync } from "node:child_process";
import { appendFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateManifest } from "@opsrabbit/plugin-sdk";
import { STARTER_IDS } from "../src/constants.js";
import { createPlugin } from "../src/commands/create.js";

describe("createPlugin", () => {
  it("keeps clean-consumer verification aligned with the public starter inventory", async () => {
    const verifier = await readFile(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "scripts",
        "verify-generated-starters.mjs",
      ),
      "utf8",
    );
    const serializedInventory = verifier.match(
      /const starterIds = (\[[\s\S]*?\]);/,
    )?.[1];
    expect(serializedInventory).toBeDefined();
    const verifierIds = [
      ...serializedInventory!.matchAll(/"([a-z0-9-]+)"/g),
    ].map((match) => match[1]);
    expect(verifierIds).toEqual([...STARTER_IDS]);
    const root = join(import.meta.dirname, "..", "..", "..");
    const reference = await readFile(
      join(root, "docs", "starter-reference.md"),
      "utf8",
    );
    const course = await readFile(
      join(root, "docs", "training-course.md"),
      "utf8",
    );
    const createReadme = await readFile(
      join(root, "packages", "create-plugin", "README.md"),
      "utf8",
    );
    for (const id of STARTER_IDS) {
      expect(reference).toContain(`\`${id}\``);
      expect(course).toContain(`- \`${id}\``);
      expect(createReadme).toContain(`- \`${id}\``);
    }
    const documentedCount =
      STARTER_IDS.length === 13 ? "thirteen" : String(STARTER_IDS.length);
    expect(reference).toContain(`all ${documentedCount}`);
    expect(course).toContain(`The ${documentedCount} current starter ids`);
  });

  it.each(STARTER_IDS)("creates a complete %s repository", async (starter) => {
    const parent = await mkdtemp(join(tmpdir(), "opsrabbit-create-"));
    const target = join(parent, starter);
    await createPlugin({ name: `Example ${starter}`, starter, output: target });
    const manifest = JSON.parse(
      await readFile(join(target, "opsrabbit.plugin.json"), "utf8"),
    ) as { id: string };
    expect(manifest.id).toBe(`example-${starter}`);
    expect(validateManifest(manifest).issues).toEqual([]);
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
    expect(releaseWorkflow).toContain("branches:\n      - main");
    expect(releaseWorkflow).toContain("plan-plugin-release.mjs");
    expect(releaseWorkflow).toContain("continue-on-error: true");
    expect(releaseWorkflow).toContain("release-assets/* --clobber");
    expect(
      await readFile(
        join(target, "scripts", "plan-plugin-release.mjs"),
        "utf8",
      ),
    ).toContain("released.includes(version)");
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

  it("generates a release planner that increments a released patch", async () => {
    const parent = await mkdtemp(join(tmpdir(), "opsrabbit-release-plan-"));
    const target = join(parent, "planned-plugin");
    await createPlugin({
      name: "Planned Plugin",
      starter: "basic-readonly",
      output: target,
    });

    git(target, ["init", "--initial-branch=main"]);
    git(target, ["config", "user.name", "Plugin Test"]);
    git(target, ["config", "user.email", "plugin-test@example.com"]);
    git(target, ["add", "."]);
    git(target, ["commit", "-m", "Initial plugin"]);
    git(target, ["tag", "v0.1.0"]);
    const before = git(target, ["rev-parse", "HEAD"]);
    await appendFile(join(target, "src", "index.ts"), "\n// release change\n");
    git(target, ["add", "src/index.ts"]);
    git(target, ["commit", "-m", "Change plugin runtime"]);
    const after = git(target, ["rev-parse", "HEAD"]);
    const manifestBeforePlanning = await readFile(
      join(target, "opsrabbit.plugin.json"),
      "utf8",
    );
    const packageBeforePlanning = await readFile(
      join(target, "package.json"),
      "utf8",
    );

    execFileSync(
      process.execPath,
      ["scripts/plan-plugin-release.mjs", before, after],
      { cwd: target, stdio: "pipe" },
    );

    const manifest = JSON.parse(
      await readFile(join(target, "opsrabbit.plugin.json"), "utf8"),
    ) as { version: string };
    const packageJson = JSON.parse(
      await readFile(join(target, "package.json"), "utf8"),
    ) as { version: string };
    expect(manifest.version).toBe("0.1.1");
    expect(packageJson.version).toBe("0.1.1");
    expect(await readFile(join(target, "opsrabbit.plugin.json"), "utf8")).toBe(
      manifestBeforePlanning.replace(
        '"version": "0.1.0"',
        '"version": "0.1.1"',
      ),
    );
    expect(await readFile(join(target, "package.json"), "utf8")).toBe(
      packageBeforePlanning.replace('"version": "0.1.0"', '"version": "0.1.1"'),
    );
  });
});

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

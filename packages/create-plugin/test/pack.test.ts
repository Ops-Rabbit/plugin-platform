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
    await mkdir(join(target, "forms"));
    await mkdir(join(target, "migrations", "declared"), { recursive: true });
    await mkdir(join(target, "migrations", "undeclared"), { recursive: true });
    const manifestPath = join(target, "opsrabbit.plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(
      manifestPath,
      JSON.stringify({
        ...manifest,
        navigation: {
          kind: "forms_workspace",
          moduleKey: "quality",
          path: "/apps/quality",
          icon: "building",
          fallbackTitle: "Quality",
        },
        formStarterPack: {
          moduleKey: "quality",
          path: "./forms/starter.json",
        },
        capabilities: {
          ...(manifest.capabilities as Record<string, unknown>),
          database: { mode: "plugin_schema" },
        },
        database: {
          migrationsPath: "./migrations/declared",
        },
      }),
    );
    await writeFile(
      join(target, "migrations", "declared", "0001_records.sql"),
      "create table records (id text primary key);\n",
    );
    await writeFile(
      join(target, "migrations", "undeclared", "not-validated.txt"),
      "must not ship\n",
    );
    await writeFile(
      join(target, "forms", "starter.json"),
      JSON.stringify({
        formatVersion: 1,
        moduleKey: "quality",
        starters: [
          {
            starterKey: "quality_report",
            title: "Quality report",
            description: "Capture quality data.",
            recordType: "quality_report",
            badge: "Quality",
            icon: "check",
            schema: {
              fields: [{ key: "batch", label: "Batch", type: "text" }],
              sections: [{ key: "main", label: "Main", fieldKeys: ["batch"] }],
              actions: [{ key: "submit", label: "Submit", kind: "submit" }],
            },
            listConfig: {
              columns: [{ fieldKey: "batch", label: "Batch" }],
              defaultSort: "updated_at_desc",
            },
          },
        ],
      }),
    );
    const first = await packPlugin(target, join(target, "release-a"));
    const second = await packPlugin(target, join(target, "release-b"));
    const firstBytes = await readFile(first);
    expect(firstBytes).toEqual(await readFile(second));
    const files = Object.keys(unzipSync(firstBytes));
    expect(files).toContain("opsrabbit.plugin.json");
    expect(files).toContain("dist/index.js");
    expect(files).toContain("forms/starter.json");
    expect(files).toContain("migrations/declared/0001_records.sql");
    expect(files).not.toContain("migrations/undeclared/not-validated.txt");
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

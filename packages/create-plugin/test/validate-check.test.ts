import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
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
  await writeFile(
    join(target, "dist", "index.js"),
    `export default { tools: [{ id: "status-summary", description: "Status", risk: "read", audience: "all", requiredPermission: "read", async run() { return null; } }] };\n`,
  );
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

  it("distinguishes an entry load failure from missing build output", async () => {
    const target = await preparedPlugin();
    await writeFile(
      join(target, "dist", "index.js"),
      `throw new Error("entry setup failed");\n`,
    );
    expect(await checkPluginDirectory(target)).toContainEqual(
      expect.objectContaining({
        code: "entry-load",
        message: expect.stringContaining("entry setup failed"),
      }),
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

  it("validates a referenced Forms starter-pack asset", async () => {
    const target = await preparedPlugin();
    const manifestPath = join(target, "opsrabbit.plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    await mkdir(join(target, "forms"));
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
          path: "./forms/quality.json",
        },
      }),
    );
    await writeFile(
      join(target, "forms", "quality.json"),
      JSON.stringify({ formatVersion: 1, moduleKey: "other", starters: [] }),
    );
    const issues = (await validatePluginDirectory(target)).issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "required" }),
        expect.objectContaining({ code: "module-mismatch" }),
      ]),
    );
  });

  it("requires a workflow root declared by the referenced starter pack", async () => {
    const parent = await mkdtemp(join(tmpdir(), "opsrabbit-workflow-"));
    const target = join(parent, "workflow");
    await createPlugin({
      name: "Workflow",
      starter: "forms-workflow",
      output: target,
    });
    const manifestPath = join(target, "opsrabbit.plugin.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      navigation: { workflow: { rootStarterKey: string } };
    };
    manifest.navigation.workflow.rootStarterKey = "missing_root";
    await writeFile(manifestPath, JSON.stringify(manifest));
    expect((await validatePluginDirectory(target)).issues).toContainEqual(
      expect.objectContaining({
        code: "workflow-root-missing",
        path: "$.navigation.workflow.rootStarterKey",
      }),
    );
  });

  it("rejects missing, non-file, and oversized starter-pack assets", async () => {
    const target = await preparedPlugin();
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
          path: "./forms/quality.json",
        },
      }),
    );
    await mkdir(join(target, "forms"));
    expect((await validatePluginDirectory(target)).issues).toContainEqual(
      expect.objectContaining({ code: "asset-read" }),
    );
    const assetPath = join(target, "forms", "quality.json");
    await mkdir(assetPath);
    expect((await validatePluginDirectory(target)).issues).toContainEqual(
      expect.objectContaining({ code: "asset-type" }),
    );
    await rm(assetPath, { recursive: true });
    await writeFile(assetPath, "x".repeat(1024 * 1024 + 1));
    expect((await validatePluginDirectory(target)).issues).toContainEqual(
      expect.objectContaining({ code: "asset-size" }),
    );
  });

  it("validates referenced plugin-schema migration assets", async () => {
    const parent = await mkdtemp(join(tmpdir(), "opsrabbit-service-"));
    const target = join(parent, "service");
    await createPlugin({
      name: "Service",
      starter: "service-ingress",
      output: target,
    });
    expect((await validatePluginDirectory(target)).issues).toEqual([]);

    const migrations = join(target, "migrations", "sql");
    await writeFile(join(migrations, "notes.txt"), "not a migration");
    expect((await validatePluginDirectory(target)).issues).toContainEqual(
      expect.objectContaining({
        code: "asset-entry",
        path: "$.database.migrationsPath",
      }),
    );
    await rm(join(migrations, "notes.txt"));
    await rm(join(migrations, "0001_service_events.sql"));
    expect((await validatePluginDirectory(target)).issues).toContainEqual(
      expect.objectContaining({ code: "asset-empty" }),
    );
  });
});

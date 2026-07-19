import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main } from "../src/cli.js";

describe("CLI", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints help, version, and examples", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    expect(await main(["--help"])).toBe(0);
    expect(await main(["--version"])).toBe(0);
    expect(await main(["examples", "list"])).toBe(0);
    expect(stdout).toHaveBeenCalledWith(
      `${[
        "basic-readonly",
        "operational-action",
        "scheduled-tenant-job",
        "database-tenant-records",
        "forms-workflow",
        "forms-insights",
        "service-ingress",
      ].join("\n")}\n`,
    );
    expect(await main(["examples", "list", "--verbose"])).toBe(0);
    expect(stdout).toHaveBeenCalledWith(
      expect.stringContaining(
        "forms-insights\tForms analytics catalog, editable Insights dashboard, and Records drill-through.",
      ),
    );
  });

  it("creates a plugin and reports validation", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const parent = await mkdtemp(join(tmpdir(), "opsrabbit-cli-"));
    const target = join(parent, "cli-plugin");
    expect(await main(["create", "CLI Plugin", "--output", target])).toBe(0);
    expect(await main(["validate", "--directory", target])).toBe(0);
    await mkdir(join(target, "dist"));
    await writeFile(
      join(target, "dist", "index.js"),
      `export default { tools: [{ id: "status-summary", description: "Status", risk: "read", audience: "all", requiredPermission: "read", async run() { return null; } }] };\n`,
    );
    expect(
      await main(["release", "--directory", target, "--tag", "v0.1.0"]),
    ).toBe(0);
  });

  it("generates versioned reference examples and rejects ambiguous selection", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const parent = await mkdtemp(join(tmpdir(), "opsrabbit-example-"));
    expect(
      await main([
        "create",
        "Example Plugin",
        "--example",
        "operational-action",
        "--output",
        join(parent, "example"),
      ]),
    ).toBe(0);
    expect(
      await main([
        "create",
        "Ambiguous",
        "--starter",
        "basic-readonly",
        "--example",
        "operational-action",
        "--output",
        join(parent, "ambiguous"),
      ]),
    ).toBe(1);
  });

  it("reports command and option errors without throwing", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    expect(await main(["unknown"])).toBe(1);
    expect(await main(["create"])).toBe(1);
    expect(await main(["create", "Plugin", "--starter", "unknown"])).toBe(1);
    expect(await main(["compatibility"])).toBe(1);
    expect(stderr).toHaveBeenCalled();
  });

  it("evaluates compatibility", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(await main(["compatibility", "--api", "1.1"])).toBe(0);
    expect(await main(["compatibility", "--api", "2.0"])).toBe(1);
  });
});

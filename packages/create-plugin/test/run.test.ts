import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runPackageScript } from "../src/commands/run.js";

describe("runPackageScript", () => {
  it("returns the package script exit code", async () => {
    const directory = await mkdtemp(join(tmpdir(), "opsrabbit-run-"));
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ scripts: { pass: 'node -e "process.exit(0)"' } }),
    );
    await expect(runPackageScript("pass", directory)).resolves.toBe(0);
    await expect(runPackageScript("missing", directory)).resolves.not.toBe(0);
  });
});

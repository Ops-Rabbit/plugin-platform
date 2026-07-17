import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = await mkdtemp(join(tmpdir(), "opsrabbit-package-verification-"));
const packageDirectories = ["packages/plugin-sdk", "packages/create-plugin"];
const forbiddenFiles = [
  /(^|\/)test\//,
  /consumer-fixture/,
  /tsconfig/,
  /vitest/,
  /(^|\/)src\//,
];
const forbiddenContent = [
  /apps\/backend\/src/,
  /OPSRABBIT_NODE_DATABASE_URL/,
  /BETTER_AUTH_SECRET/,
];

try {
  for (const packageDirectory of packageDirectories) {
    const raw = execFileSync(
      "pnpm",
      [
        "--dir",
        packageDirectory,
        "pack",
        "--pack-destination",
        output,
        "--json",
      ],
      { cwd: root, encoding: "utf8" },
    );
    const result = JSON.parse(raw);
    const paths = result.files.map((file) => file.path);
    const bad = paths.filter(
      (path) =>
        path.endsWith(".map") ||
        (!path.startsWith("assets/") &&
          forbiddenFiles.some((pattern) => pattern.test(path))),
    );
    if (bad.length > 0)
      throw new Error(
        `${packageDirectory} contains forbidden packed files:\n${bad.join("\n")}`,
      );
    for (const required of ["README.md", "LICENSE", "NOTICE", "package.json"]) {
      if (!paths.includes(required))
        throw new Error(`${packageDirectory} is missing ${required}`);
    }
    const manifest = JSON.parse(
      await readFile(join(root, packageDirectory, "package.json"), "utf8"),
    );
    if (
      manifest.name === "@opsrabbit/plugin-sdk" &&
      !paths.includes("schemas/opsrabbit-plugin.schema.json")
    ) {
      throw new Error("SDK package is missing its public manifest schema");
    }
    if (
      manifest.name === "@opsrabbit/plugin-sdk" &&
      !paths.includes("schemas/opsrabbit-form-starter-pack.schema.json")
    ) {
      throw new Error("SDK package is missing its Forms starter-pack schema");
    }
    if (
      manifest.name === "@opsrabbit/create-plugin" &&
      !paths.some((path) => path.startsWith("assets/starters/"))
    ) {
      throw new Error("CLI package is missing starter/reference assets");
    }
    const listing = execFileSync("tar", ["-xOzf", result.filename], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    for (const pattern of forbiddenContent) {
      if (pattern.test(listing))
        throw new Error(
          `${manifest.name} packed content matches forbidden pattern ${pattern}`,
        );
    }
  }
} finally {
  await rm(output, { recursive: true, force: true });
}

process.stdout.write("Packed package inventories are clean.\n");

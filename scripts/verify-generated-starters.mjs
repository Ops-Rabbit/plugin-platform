import { execFileSync } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temporaryRoot = await mkdtemp(join(tmpdir(), "opsrabbit-starters-"));
const tarballDirectory = join(temporaryRoot, "packages");
const starterIds = [
  "basic-readonly",
  "operational-action",
  "scheduled-tenant-job",
  "database-tenant-records",
  "forms-workflow",
  "service-ingress",
];
await mkdir(tarballDirectory);

try {
  const sdk = pack("packages/plugin-sdk");
  const cli = pack("packages/create-plugin");
  for (const starter of starterIds) {
    const target = join(temporaryRoot, starter);
    run(
      "node",
      [
        "packages/create-plugin/dist/cli.js",
        "create",
        `Reference ${starter}`,
        "--starter",
        starter,
        "--output",
        target,
      ],
      root,
    );
    const packagePath = join(target, "package.json");
    const manifest = JSON.parse(await readFile(packagePath, "utf8"));
    manifest.dependencies["@opsrabbit/plugin-sdk"] = `file:${sdk}`;
    manifest.devDependencies["@opsrabbit/create-plugin"] = `file:${cli}`;
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
    run(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
      target,
    );
    for (const script of [
      "check",
      "test:coverage",
      "build",
      "plugin:check",
      "plugin:pack",
      "plugin:release",
    ]) {
      run("npm", ["run", script], target);
    }
    const pluginManifest = JSON.parse(
      await readFile(join(target, "opsrabbit.plugin.json"), "utf8"),
    );
    await access(
      join(
        target,
        "release",
        `${pluginManifest.id}-${pluginManifest.version}.zip`,
      ),
    );
    for (const suffix of ["zip", "zip.sha256", "spdx.json", "release.json"])
      await access(
        join(
          target,
          "release-assets",
          `${pluginManifest.id}-${pluginManifest.version}.${suffix}`,
        ),
      );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

process.stdout.write(
  "All generated starters pass clean-consumer verification.\n",
);

function pack(directory) {
  const result = JSON.parse(
    execFileSync(
      "pnpm",
      [
        "--dir",
        directory,
        "pack",
        "--pack-destination",
        tarballDirectory,
        "--json",
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    ),
  );
  return result.filename;
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

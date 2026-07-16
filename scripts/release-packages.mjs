import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const releaseDirectory = resolve(root, ".release-packages");
const packages = ["packages/plugin-sdk", "packages/create-plugin"];
execFileSync("node", ["scripts/verify-release-versions.mjs"], {
  cwd: root,
  stdio: "inherit",
});
await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });

for (const directory of packages) {
  const manifest = JSON.parse(
    await readFile(resolve(root, directory, "package.json"), "utf8"),
  );
  if (versionExists(manifest.name, manifest.version)) {
    process.stdout.write(
      `${manifest.name}@${manifest.version} already exists; skipping.\n`,
    );
    continue;
  }
  const output = execFileSync(
    "pnpm",
    [
      "--dir",
      directory,
      "pack",
      "--pack-destination",
      releaseDirectory,
      "--json",
    ],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  const tarball = JSON.parse(output).filename;
  if (!tarball)
    throw new Error(`Could not determine tarball for ${manifest.name}`);
  execFileSync("npm", ["publish", tarball, "--access", "public"], {
    cwd: root,
    stdio: "inherit",
  });
  waitForVersion(manifest.name, manifest.version);
}

function versionExists(name, version) {
  return (
    spawnSync("npm", ["view", `${name}@${version}`, "version"], {
      stdio: "ignore",
    }).status === 0
  );
}

function waitForVersion(name, version) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (versionExists(name, version)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
  throw new Error(`${name}@${version} did not become visible in the registry.`);
}

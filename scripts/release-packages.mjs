import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

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
  if (await versionExists(manifest.name, manifest.version)) {
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
  await waitForVersion(manifest.name, manifest.version);
}

async function versionExists(name, version) {
  const encodedName = name.replace("/", "%2f");
  const response = await fetch(
    `https://registry.npmjs.org/${encodedName}/${encodeURIComponent(version)}?cache=${Date.now()}`,
    { headers: { accept: "application/json", "cache-control": "no-cache" } },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `npm registry returned ${response.status} while checking ${name}@${version}.`,
    );
  }
  const metadata = await response.json();
  return metadata.name === name && metadata.version === version;
}

async function waitForVersion(name, version) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await versionExists(name, version)) return;
    await delay(5000);
  }
  throw new Error(`${name}@${version} did not become visible in the registry.`);
}

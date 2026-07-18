import { execFileSync } from "node:child_process";
import process from "node:process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/u;

const [mode, value] = process.argv.slice(2);
if (!mode || !value)
  throw new Error("Expected <before-sha> <after-sha> or --tag <vX.Y.Z>.");

const manifestPath = resolve(root, "opsrabbit.plugin.json");
const packagePath = resolve(root, "package.json");
const manifestSource = await readFile(manifestPath, "utf8");
const packageSource = await readFile(packagePath, "utf8");
const manifest = JSON.parse(manifestSource);
const packageJson = JSON.parse(packageSource);
if (manifest.version !== packageJson.version)
  throw new Error("Plugin manifest and package versions differ.");

let version = manifest.version;
parseVersion(version);
let shouldRelease = true;
if (mode === "--tag") {
  const expected = `v${version}`;
  if (value !== expected)
    throw new Error(`Release tag ${value} must match ${expected}.`);
} else {
  const paths = changedPaths(mode, value);
  shouldRelease = paths.some(releaseRelevant);
  if (shouldRelease) {
    const released = git(["tag", "--list", "v*.*.*"])
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((tag) => tag.slice(1))
      .filter((candidate) => SEMVER.test(candidate))
      .sort(compareVersions);
    if (
      released.includes(version) ||
      (released.at(-1) && compareVersions(version, released.at(-1)) <= 0)
    ) {
      const [major, minor, patch] = parseVersion(released.at(-1) ?? version);
      version = `${major}.${minor}.${patch + 1}`;
      await writeFile(
        manifestPath,
        replaceJsonVersion(manifestSource, manifest.version, version),
      );
      await writeFile(
        packagePath,
        replaceJsonVersion(packageSource, packageJson.version, version),
      );
    }
  }
}

const output = {
  has_release: shouldRelease,
  tag: `v${version}`,
  version,
  plugin_id: manifest.id,
  plugin_name: manifest.name,
};
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(output)
      .map(([key, entry]) => `${key}=${entry}`)
      .join("\n") + "\n",
  );
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

function changedPaths(before, after) {
  const args = /^0+$/u.test(before)
    ? ["diff-tree", "--no-commit-id", "--name-only", "-r", after]
    : ["diff", "--name-only", before, after];
  return git(args).split(/\r?\n/u).filter(Boolean);
}

function releaseRelevant(path) {
  return !(
    path === "README.md" ||
    path === "AGENTS.md" ||
    path.startsWith(".github/") ||
    path.startsWith("test/") ||
    path.startsWith("coverage/") ||
    path.startsWith("release/") ||
    path.startsWith("release-assets/") ||
    path === "scripts/plan-plugin-release.mjs"
  );
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index])
      return leftParts[index] - rightParts[index];
  }
  return 0;
}

function parseVersion(input) {
  const match = SEMVER.exec(input);
  if (!match)
    throw new Error(`Unsupported plugin version ${input}; expected X.Y.Z.`);
  return match.slice(1).map(Number);
}

function replaceJsonVersion(source, currentVersion, nextVersion) {
  const encodedCurrent = JSON.stringify(currentVersion);
  const encodedNext = JSON.stringify(nextVersion);
  const versionProperty = new RegExp(
    `("version"\\s*:\\s*)${escapeRegExp(encodedCurrent)}`,
    "gu",
  );
  const matches = [...source.matchAll(versionProperty)];
  if (matches.length !== 1)
    throw new Error("Expected exactly one JSON version property.");
  const updated = source.replace(versionProperty, `$1${encodedNext}`);
  if (JSON.parse(updated).version !== nextVersion)
    throw new Error("Failed to update the JSON version property.");
  return updated;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

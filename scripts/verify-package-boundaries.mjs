import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicPackages = ["packages/plugin-sdk", "packages/create-plugin"];
const forbidden = [
  /(?:from|import\()\s*['"](?:@opsrabbit\/(?:backend|plugin-host-internal)|\.\.\/\.\.\/apps\/backend)/,
  /OPSRABBIT_NODE_DATABASE_URL/,
  /BETTER_AUTH_SECRET/,
  /OPSRABBIT_NODE_ENCRYPTION_KEY/,
  /apps\/backend\/src/,
];
const violations = [];

for (const packageDirectory of publicPackages) {
  const absolutePackage = join(root, packageDirectory);
  const packageJson = JSON.parse(
    await readFile(join(absolutePackage, "package.json"), "utf8"),
  );
  if (packageJson.private === true)
    violations.push(`${packageDirectory}: public package must not be private`);
  for (const section of [
    "dependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
      if (
        String(version).startsWith("file:") ||
        String(version).startsWith("link:")
      ) {
        violations.push(
          `${packageDirectory}: ${section}.${name} uses a local-only dependency`,
        );
      }
    }
  }
  for (const file of await walk(absolutePackage)) {
    if (
      ![".ts", ".js", ".mjs", ".json", ".md", ".tmpl"].includes(extname(file))
    )
      continue;
    const content = await readFile(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(content))
        violations.push(
          `${relative(root, file)}: matches forbidden public-boundary pattern ${pattern}`,
        );
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Public package boundaries are clean.\n");
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

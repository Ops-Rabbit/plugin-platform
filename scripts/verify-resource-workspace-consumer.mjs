import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(
  join(tmpdir(), "opsrabbit-resource-workspace-consumer-"),
);
try {
  const packed = JSON.parse(
    execFileSync(
      "pnpm",
      [
        "--dir",
        "packages/plugin-sdk",
        "pack",
        "--pack-destination",
        target,
        "--json",
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
  await writeFile(
    join(target, "package.json"),
    JSON.stringify({
      private: true,
      type: "module",
      dependencies: { "@opsrabbit/plugin-sdk": `file:${packed.filename}` },
    }),
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: target, stdio: "inherit" },
  );
  await copyFile(
    join(root, "packages/plugin-sdk/reference/resource-workspace.mjs"),
    join(target, "reference.mjs"),
  );
  await copyFile(
    join(root, "packages/plugin-sdk/reference/inbound-registration.mjs"),
    join(target, "inbound-registration.mjs"),
  );
  await copyFile(
    join(root, "scripts/fixtures/resource-workspace-consumer.mjs"),
    join(target, "verify.mjs"),
  );
  execFileSync("node", ["verify.mjs"], { cwd: target, stdio: "inherit" });
  process.stdout.write(
    "Resource workspace contracts and reference verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}

import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = await mkdtemp(
  join(tmpdir(), "opsrabbit-channel-approval-consumer-"),
);
try {
  const raw = execFileSync(
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
  );
  const packed = JSON.parse(raw);
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
    join(root, "packages/plugin-sdk/reference/channel-approvals.mjs"),
    join(target, "reference.mjs"),
  );
  execFileSync("node", ["reference.mjs"], { cwd: target, stdio: "inherit" });
  const schema = JSON.parse(
    await readFile(
      join(
        target,
        "node_modules/@opsrabbit/plugin-sdk/schemas/opsrabbit-channel-approval-decision.schema.json",
      ),
      "utf8",
    ),
  );
  if (schema.properties.decision.enum.join(",") !== "allow-once,deny")
    throw new Error(
      "Packed approval schema does not preserve one-time semantics.",
    );
  process.stdout.write(
    "Channel approval reference verified against packed SDK outside workspace.\n",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}

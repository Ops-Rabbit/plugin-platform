import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sdk = JSON.parse(
  await readFile(resolve(root, "packages/plugin-sdk/package.json"), "utf8"),
);
const cli = JSON.parse(
  await readFile(resolve(root, "packages/create-plugin/package.json"), "utf8"),
);
const constants = await readFile(
  resolve(root, "packages/create-plugin/src/constants.ts"),
  "utf8",
);
const expectedRange = `workspace:^`;

if (sdk.version !== cli.version)
  throw new Error(
    `Package versions differ: SDK ${sdk.version}, CLI ${cli.version}`,
  );
if (cli.dependencies?.["@opsrabbit/plugin-sdk"] !== expectedRange) {
  throw new Error(
    `CLI SDK dependency must be ${expectedRange} in the workspace source.`,
  );
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(sdk.version))
  throw new Error(`Invalid release version: ${sdk.version}`);
if (!constants.includes(`CLI_VERSION = "${cli.version}"`))
  throw new Error("CLI_VERSION must match the package version.");
if (!constants.includes(`SDK_VERSION = "^${sdk.version}"`))
  throw new Error("Generated SDK_VERSION must match the released SDK version.");
process.stdout.write(`Release versions are aligned at ${sdk.version}.\n`);

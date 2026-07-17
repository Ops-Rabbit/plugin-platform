#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkApiCompatibility } from "@opsrabbit/plugin-sdk";
import { CLI_VERSION, STARTER_IDS, isStarterId } from "./constants.js";
import { checkPluginDirectory } from "./commands/check.js";
import { createPlugin } from "./commands/create.js";
import { packPlugin } from "./commands/pack.js";
import { preparePluginRelease } from "./commands/release.js";
import { runPackageScript } from "./commands/run.js";
import { validatePluginDirectory } from "./commands/validate.js";

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case "create":
        return await createCommand(args);
      case "examples":
        return examplesCommand(args);
      case "validate":
        return reportIssues(
          (await validatePluginDirectory(valueAfter(args, "--directory")))
            .issues,
        );
      case "check":
        return reportIssues(
          await checkPluginDirectory(valueAfter(args, "--directory")),
        );
      case "test":
        return await runPackageScript("test", valueAfter(args, "--directory"));
      case "pack": {
        const output = await packPlugin(valueAfter(args, "--directory"));
        process.stdout.write(`Created ${output}\n`);
        return 0;
      }
      case "release": {
        const directory = valueAfter(args, "--directory");
        const tag = valueAfter(args, "--tag");
        const outputDirectory = valueAfter(args, "--output");
        const artifacts = await preparePluginRelease({
          ...(directory === undefined ? {} : { directory }),
          ...(tag === undefined ? {} : { tag }),
          ...(outputDirectory === undefined ? {} : { outputDirectory }),
        });
        process.stdout.write(
          `Created release artifacts:\n${artifacts.map((path) => `- ${path}`).join("\n")}\n`,
        );
        return 0;
      }
      case "compatibility": {
        const requested = requiredValue(args, "--api");
        const supported = valueAfter(args, "--host-api") ?? "1.0";
        const result = checkApiCompatibility(requested, supported);
        process.stdout.write(
          `${result.compatible ? "compatible" : "incompatible"}: ${result.reason}\n`,
        );
        return result.compatible ? 0 : 1;
      }
      case "--version":
      case "-v":
        process.stdout.write(`${CLI_VERSION}\n`);
        return 0;
      case "--help":
      case "-h":
      case undefined:
        process.stdout.write(help());
        return command === undefined ? 1 : 0;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

async function createCommand(args: string[]): Promise<number> {
  const name = args.find((argument) => !argument.startsWith("-"));
  if (!name)
    throw new Error(
      "Usage: opsrabbit-plugin create <name> [--starter <id>] [--output <directory>]",
    );
  const starterOption = valueAfter(args, "--starter");
  const exampleOption = valueAfter(args, "--example");
  if (starterOption && exampleOption)
    throw new Error("Choose either --starter or --example, not both.");
  const starterValue = starterOption ?? exampleOption ?? "basic-readonly";
  if (!isStarterId(starterValue))
    throw new Error(
      `Unknown starter ${starterValue}. Choose: ${STARTER_IDS.join(", ")}`,
    );
  const output = valueAfter(args, "--output");
  const target = await createPlugin({
    name,
    starter: starterValue,
    ...(output === undefined ? {} : { output }),
  });
  process.stdout.write(
    `Created ${target}\nNext: cd ${target} && npm install && npm test && npm run build\n`,
  );
  return 0;
}

function examplesCommand(args: string[]): number {
  if (args[0] !== "list")
    throw new Error("Usage: opsrabbit-plugin examples list");
  process.stdout.write(`${STARTER_IDS.join("\n")}\n`);
  return 0;
}

function reportIssues(
  issues: ReadonlyArray<{ path: string; code: string; message: string }>,
): number {
  if (issues.length === 0) {
    process.stdout.write("Plugin is valid.\n");
    return 0;
  }
  for (const issue of issues)
    process.stderr.write(`${issue.path} [${issue.code}] ${issue.message}\n`);
  return 1;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function requiredValue(args: string[], flag: string): string {
  const value = valueAfter(args, flag);
  if (!value) throw new Error(`Missing required ${flag} value.`);
  return value;
}

function help(): string {
  return `OpsRabbit plugin developer CLI

Usage:
  opsrabbit-plugin create <name> [--starter <id> | --example <id>] [--output <directory>]
  opsrabbit-plugin examples list
  opsrabbit-plugin validate [--directory <directory>]
  opsrabbit-plugin check [--directory <directory>]
  opsrabbit-plugin test [--directory <directory>]
  opsrabbit-plugin pack [--directory <directory>]
  opsrabbit-plugin release [--directory <directory>] [--tag <vX.Y.Z>] [--output <directory>]
  opsrabbit-plugin compatibility --api <major.minor> [--host-api <major.minor>]
`;
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}

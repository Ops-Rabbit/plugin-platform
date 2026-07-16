import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CLI_VERSION, SDK_VERSION, type StarterId } from "../constants.js";
import { createFilePlan } from "../generator/file-plan.js";
import { normalizePluginName } from "../generator/names.js";
import { renderTemplate } from "../generator/render.js";

export interface CreateOptions {
  name: string;
  starter: StarterId;
  output?: string;
}

export async function createPlugin(options: CreateOptions): Promise<string> {
  const names = normalizePluginName(options.name);
  const target = resolve(options.output ?? names.id);
  if (await exists(target)) throw new Error(`Target already exists: ${target}`);

  const generatedAt = new Date();
  const values = {
    ...names,
    sdkVersion: SDK_VERSION,
    cliVersion: CLI_VERSION,
    starterId: options.starter,
    generatedAt: generatedAt.toISOString(),
    generatedYear: String(generatedAt.getUTCFullYear()),
  };
  const files = await createFilePlan(options.starter);
  for (const file of files) {
    const destination = resolve(target, file.path);
    if (!destination.startsWith(`${target}/`))
      throw new Error(`Unsafe generated path: ${file.path}`);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, renderTemplate(file.content, values), {
      flag: "wx",
    });
  }
  return target;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

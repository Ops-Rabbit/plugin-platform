import { rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

const requested = process.argv[2];
if (!requested || basename(requested) !== "dist")
  throw new Error("Only a package dist directory may be cleaned.");
const target = resolve(process.cwd(), requested);
if (target === resolve(process.cwd()))
  throw new Error("Refusing to clean the working directory.");
await rm(target, { recursive: true, force: true });

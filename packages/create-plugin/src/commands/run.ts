import { spawn } from "node:child_process";

export async function runPackageScript(
  script: string,
  directory = process.cwd(),
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", script], {
      cwd: directory,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal)
        reject(new Error(`npm run ${script} terminated by ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

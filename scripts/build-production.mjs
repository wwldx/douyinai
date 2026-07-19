import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const viteBinary = fileURLToPath(new URL("../frontend/node_modules/.bin/vite", import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

if (!existsSync(viteBinary)) {
  await run(["--prefix", "frontend", "ci"]);
}

await run(["--prefix", "frontend", "run", "build"]);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${npmCommand} ${args.join(" ")} 失败（code=${code}, signal=${signal || "none"}）`));
    });
  });
}

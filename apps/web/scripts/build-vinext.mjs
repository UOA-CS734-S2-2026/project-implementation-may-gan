import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.on("error", () => resolve(1));
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const buildStatus = await run("vite", ["build"]);
const typegenStatus = await run("next", ["typegen"]);

process.exitCode = buildStatus || typegenStatus;

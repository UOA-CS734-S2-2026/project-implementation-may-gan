import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const generatedPaths = [
  "packages/api-client-typescript",
  "packages/api-client-dart",
  "packages/contracts/openapi.json",
];

async function checkGeneratedClients() {
  const { stdout } = await execFileAsync("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ...generatedPaths,
  ]);

  if (stdout.trim()) {
    console.error("Generated API clients are not current:");
    console.error(stdout.trimEnd());
    console.error("Run `pnpm generate:clients` and commit the results.");
    process.exitCode = 1;
  }
}

checkGeneratedClients().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

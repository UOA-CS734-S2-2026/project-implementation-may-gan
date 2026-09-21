import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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

  const [typescriptModel, dartModel, typescriptApi, dartClient, dartAuth] = await Promise.all([
    readFile("packages/api-client-typescript/src/models/CurrentPostingDayResponse.ts", "utf8"),
    readFile("packages/api-client-dart/lib/model/current_posting_day_response.dart", "utf8"),
    readFile("packages/api-client-typescript/src/apis/PostingDaysApi.ts", "utf8"),
    readFile("packages/api-client-dart/lib/api_client.dart", "utf8"),
    readFile("packages/api-client-dart/lib/auth/http_bearer_auth.dart", "utf8"),
  ]);

  const checks: Array<[string, boolean]> = [
    ["TypeScript localDate is a date-only string", /localDate: string;/.test(typescriptModel)],
    ["Dart localDate is a date-only string", /final String localDate;/.test(dartModel)],
    ["TypeScript posting-day client declares bearer auth", /accessToken/.test(typescriptApi)],
    ["Dart client accepts configured authentication", /authentication\?\.applyToParams/.test(dartClient)],
    ["Dart client provides bearer authentication", /headerParams\['Authorization'\] = 'Bearer/.test(dartAuth)],
    ["Dart localDate stays a string during JSON conversion", /localDate: mapValueOfType<String>/.test(dartModel)],
  ];
  const failedChecks = checks.filter(([, passed]) => !passed).map(([description]) => description);
  if (failedChecks.length > 0) {
    console.error("Generated API clients do not preserve the API contract:");
    for (const description of failedChecks) console.error(`- ${description}`);
    process.exitCode = 1;
  }
}

checkGeneratedClients().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

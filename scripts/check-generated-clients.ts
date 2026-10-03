import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const generatedPaths = [
  "packages/api-client-typescript",
  "packages/api-client-dart",
  "packages/contracts/openapi.json",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function generatedMethodName(operationId: string): string {
  const [resource, action] = operationId.split(".");
  if (!resource || !action) {
    throw new Error(`Unsupported operationId format: ${operationId}`);
  }
  return `${resource}${action[0].toUpperCase()}${action.slice(1)}`;
}

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

  const [
    openapi,
    typescriptModel,
    dartModel,
    dartCreateDailyPostRequest,
    dartDailyPost,
    dartDailyPostTomorrowNote,
    dartTrashedPostStatus,
    typescriptApi,
    typescriptRelationshipsApi,
    dartClient,
    dartAuth,
    dartRelationshipsApi,
  ] = await Promise.all([
    readFile("packages/contracts/openapi.json", "utf8").then((contents) => JSON.parse(contents) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    }),
    readFile("packages/api-client-typescript/src/models/CurrentPostingDayResponse.ts", "utf8"),
    readFile("packages/api-client-dart/lib/model/current_posting_day_response.dart", "utf8"),
    readFile("packages/api-client-dart/lib/model/create_daily_post_request.dart", "utf8"),
    readFile("packages/api-client-dart/lib/model/daily_post.dart", "utf8"),
    readFile("packages/api-client-dart/lib/model/daily_post_tomorrow_note.dart", "utf8"),
    readFile("packages/api-client-dart/lib/model/trashed_post_status.dart", "utf8"),
    readFile("packages/api-client-typescript/src/apis/PostingDaysApi.ts", "utf8"),
    readFile("packages/api-client-typescript/src/apis/RelationshipsApi.ts", "utf8"),
    readFile("packages/api-client-dart/lib/api_client.dart", "utf8"),
    readFile("packages/api-client-dart/lib/auth/http_bearer_auth.dart", "utf8"),
    readFile("packages/api-client-dart/lib/api/relationships_api.dart", "utf8"),
  ]);

  const relationshipOperationIds = Object.values(openapi.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .map((operation) => operation.operationId)
    .filter((operationId): operationId is string => operationId?.startsWith("relationships.") ?? false);
  const relationshipMethodNames = relationshipOperationIds.map(generatedMethodName);
  const missingTypescriptMethods = relationshipMethodNames.filter(
    (methodName) => !new RegExp(`\\basync\\s+${escapeRegExp(methodName)}\\s*\\(`).test(typescriptRelationshipsApi),
  );
  const missingDartMethods = relationshipMethodNames.filter(
    (methodName) => !new RegExp(`\\bFuture(?:<[^>]+>)?\\s+${escapeRegExp(methodName)}\\s*\\(`).test(dartRelationshipsApi),
  );

  const checks: Array<[string, boolean]> = [
    ["TypeScript localDate is a date-only string", /localDate: string;/.test(typescriptModel)],
    ["Dart localDate is a date-only string", /final String localDate;/.test(dartModel)],
    ["TypeScript posting-day client declares bearer auth", /accessToken/.test(typescriptApi)],
    ["TypeScript relationship client declares bearer auth", /accessToken/.test(typescriptRelationshipsApi)],
    [
      "TypeScript relationship client exposes every OpenAPI operation",
      relationshipOperationIds.length > 0 && missingTypescriptMethods.length === 0,
    ],
    ["Dart client accepts configured authentication", /authentication\?\.applyToParams/.test(dartClient)],
    ["Dart client provides bearer authentication", /headerParams\['Authorization'\] = 'Bearer/.test(dartAuth)],
    [
      "Dart relationship client exposes every OpenAPI operation",
      relationshipOperationIds.length > 0 && missingDartMethods.length === 0,
    ],
    ["Dart localDate stays a string during JSON conversion", /localDate: mapValueOfType<String>/.test(dartModel)],
    [
      "Dart daily-post request localDate stays a string during JSON conversion",
      /json\[r'localDate'\] = this\.localDate;/.test(dartCreateDailyPostRequest) &&
        /localDate: mapValueOfType<String>/.test(dartCreateDailyPostRequest),
    ],
    [
      "Dart daily-post localDate stays a string during JSON conversion",
      /json\[r'localDate'\] = this\.localDate;/.test(dartDailyPost) &&
        /localDate: mapValueOfType<String>/.test(dartDailyPost),
    ],
    [
      "Dart Post Trash localDate stays a string during JSON conversion",
      /json\[r'localDate'\] = this\.localDate;/.test(dartTrashedPostStatus) &&
        /localDate: mapValueOfType<String>/.test(dartTrashedPostStatus),
    ],
    [
      "Dart daily-post tomorrow-note availableOn stays a string during JSON conversion",
      /json\[r'availableOn'\] = this\.availableOn;/.test(dartDailyPostTomorrowNote) &&
        /availableOn: mapValueOfType<String>/.test(dartDailyPostTomorrowNote),
    ],
  ];
  const failedChecks = checks.filter(([, passed]) => !passed).map(([description]) => description);
  if (missingTypescriptMethods.length > 0) {
    failedChecks.push(`Missing TypeScript relationship methods: ${missingTypescriptMethods.join(", ")}`);
  }
  if (missingDartMethods.length > 0) {
    failedChecks.push(`Missing Dart relationship methods: ${missingDartMethods.join(", ")}`);
  }
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

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const textExtensions = new Set([".dart", ".json", ".md", ".ts", ".yaml"]);

const typescriptReadme = `# @dayli/api-client

Generated TypeScript Fetch client for the Dayli API. Do not edit this package by hand.

## Usage

Pass the API URL explicitly when the application starts:

\`\`\`ts
import { Configuration, SystemApi } from "@dayli/api-client";

const configuration = new Configuration({
  basePath: process.env.NEXT_PUBLIC_API_BASE_URL,
  credentials: "include",
});
const systemApi = new SystemApi(configuration);
const health = await systemApi.systemHealth();
\`\`\`

Do not rely on the generator's localhost fallback. The application configuration owns the URL and authentication settings.

Regenerate this package from the repository root with \`pnpm generate:clients\`.
`;

const dartReadme = `# dayli_api_client

Generated Dart client for the Dayli API. Do not edit this package by hand.

## Usage

Add this workspace package to the Flutter application with a path dependency, then pass the API URL explicitly:

\`\`\`dart
import 'package:dayli_api_client/api.dart';

final client = ApiClient(basePath: apiBaseUrl);
final systemApi = SystemApi(client);
final health = await systemApi.systemHealth();
\`\`\`

For local HTTPS auth, use \`https://localhost:8787\` in iOS Simulator. Android emulators and USB-connected debug devices use that same URL with \`adb reverse tcp:8787 tcp:8787\` in a debug build that passes the mkcert root as \`DAYLI_DEV_CA_PEM_B64\`, because Dart HTTP ignores CAs installed on the device. It is not a LAN-accessible endpoint. See [Environments](../../docs/dayli/environments.md) for the trust and launch steps. Staging and production URLs must come from application configuration.

Regenerate this package from the repository root with \`pnpm generate:clients\`.
`;

const dartSmokeTest = `import 'package:dayli_api_client/api.dart';
import 'package:test/test.dart';

void main() {
  test('constructs the public client with an explicit base URL', () {
    const baseUrl = 'https://localhost:8787';
    final client = ApiClient(basePath: baseUrl);
    final api = SystemApi(client);

    expect(api.apiClient.basePath, baseUrl);
  });
}
`;

async function normalizeTextFiles(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await normalizeTextFiles(path);
      } else if (textExtensions.has(extname(entry.name))) {
        const source = await readFile(path, "utf8");
        const normalized = `${source.replace(/[ \t]+$/gm, "").trimEnd()}\n`;
        await writeFile(path, normalized);
      }
    }),
  );
}

async function normalizeDartDateOnlyModel(path: string, field: string): Promise<void> {
  const source = await readFile(path, "utf8");
  const normalized = source
    .replace(
      `json[r'${field}'] = _dateFormatter.format(this.${field});`,
      `json[r'${field}'] = this.${field};`,
    )
    .replace(
      `${field}: mapDateTime(json, r'${field}', r'')!,`,
      `${field}: mapValueOfType<String>(json, r'${field}')!,`,
    );

  if (normalized === source) {
    throw new Error(`Could not normalize Dart date-only field ${field} in ${path}`);
  }
  await writeFile(path, normalized);
}

async function normalizeNullableExportDates(path: string): Promise<void> {
  const source = await readFile(path, "utf8");
  const normalized = source
    .replace(/(readyAt|expiresAt): Date;/g, "$1: Date | null;")
    .replace(/final DateTime (readyAt|expiresAt);/g, "final DateTime? $1;")
    .replace(/json\[r'(readyAt|expiresAt)'\] = this\.\1\.toUtc\(\)\.toIso8601String\(\);/g, "json[r'$1'] = this.$1 == null ? null : this.$1!.toUtc().toIso8601String();")
    .replace(/(readyAt|expiresAt): mapDateTime\(json, r'\1', r''\)!/g, "$1: mapDateTime(json, r'$1', r'' )")
    .replace(/\s*assert\(json\[r'(?:readyAt|expiresAt)'\] != null,[^;]+\);/g, "");
  if (normalized === source) throw new Error(`Could not normalize nullable export dates in ${path}`);
  await writeFile(path, normalized);
}

async function finalizeGeneratedClients() {
  const dartPubspecPath = "packages/api-client-dart/pubspec.yaml";
  const dartPubspec = await readFile(dartPubspecPath, "utf8");

  await mkdir("packages/api-client-dart/test", { recursive: true });
  await Promise.all([
    rm("packages/api-client-dart/.travis.yml", { force: true }),
    rm("packages/api-client-dart/git_push.sh", { force: true }),
    writeFile("packages/api-client-typescript/README.md", typescriptReadme),
    writeFile("packages/api-client-dart/README.md", dartReadme),
    writeFile("packages/api-client-dart/test/client_smoke_test.dart", dartSmokeTest),
    writeFile(
      dartPubspecPath,
      dartPubspec.replace(
        "test: '>=1.21.6 <1.22.0'",
        "test: '>=1.25.0 <2.0.0'",
      ),
    ),
    writeFile(
      "packages/api-client-dart/analysis_options.yaml",
      [
        "# Generated client compatibility settings.",
        "analyzer:",
        "  errors:",
        "    unawaited_return_in_try_block: ignore",
        "",
      ].join("\n"),
    ),
    normalizeDartDateOnlyModel(
      "packages/api-client-dart/lib/model/create_daily_post_request.dart",
      "localDate",
    ),
    normalizeDartDateOnlyModel(
      "packages/api-client-dart/lib/model/current_posting_day_response.dart",
      "localDate",
    ),
    normalizeDartDateOnlyModel(
      "packages/api-client-dart/lib/model/daily_post.dart",
      "localDate",
    ),
    normalizeDartDateOnlyModel(
      "packages/api-client-dart/lib/model/daily_post_tomorrow_note.dart",
      "availableOn",
    ),
    normalizeDartDateOnlyModel(
      "packages/api-client-dart/lib/model/feed_post.dart",
      "localDate",
    ),
    normalizeDartDateOnlyModel(
      "packages/api-client-dart/lib/model/post_detail.dart",
      "localDate",
    ),
    normalizeDartDateOnlyModel(
      "packages/api-client-dart/lib/model/test_response.dart",
      "aucklandDate",
    ),
    normalizeNullableExportDates("packages/api-client-typescript/src/models/AccountRequestDataExport202Response.ts"),
    normalizeNullableExportDates("packages/api-client-typescript/src/models/AccountGetDataExport200ResponseExport.ts"),
    normalizeNullableExportDates("packages/api-client-dart/lib/model/account_request_data_export202_response.dart"),
    normalizeNullableExportDates("packages/api-client-dart/lib/model/account_get_data_export200_response_export.dart"),
  ]);

  await Promise.all([
    normalizeTextFiles("packages/api-client-typescript"),
    normalizeTextFiles("packages/api-client-dart"),
  ]);
}

finalizeGeneratedClients().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

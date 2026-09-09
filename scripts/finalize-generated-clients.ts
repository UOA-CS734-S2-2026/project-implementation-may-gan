import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

const textExtensions = new Set([".dart", ".json", ".md", ".ts", ".yaml"]);

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

async function finalizeGeneratedClients() {
  await Promise.all([
    rm("packages/api-client-dart/.travis.yml", { force: true }),
    rm("packages/api-client-dart/git_push.sh", { force: true }),
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

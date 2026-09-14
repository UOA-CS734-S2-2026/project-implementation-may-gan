import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { repoPath, repoRoot } from "./migrations/paths";
import { parseMigrationReview } from "./migrations/reviews";
import { readLocalMigrations } from "./migrations/state";

const execFileAsync = promisify(execFile);

const migrationsDir = repoPath("packages/db/migrations");
const reviewsDir = path.join(migrationsDir, "reviews");

function fail(message: string): never {
  throw new Error(message);
}

async function run(command: string, args: string[], cwd = repoRoot()): Promise<string> {
  try {
    const result = await execFileAsync(command, args, { cwd, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    return `${result.stdout}${result.stderr}`;
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error && "stderr" in error) {
      const details = `${String(error.stdout)}${String(error.stderr)}`.trim();
      throw new Error(details || `Command failed: ${command} ${args.join(" ")}`);
    }

    throw error;
  }
}

async function ensureJournalMatchesFiles(): Promise<void> {
  const migrations = await readLocalMigrations();
  const journal = JSON.parse(await readFile(path.join(migrationsDir, "meta", "_journal.json"), "utf8")) as {
    entries: Array<{ when: number }>;
  };
  const names = await readdir(migrationsDir);
  const sqlFiles = names.filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  const journalFiles = migrations.map((migration) => path.basename(migration.path)).sort();

  if (JSON.stringify(sqlFiles) !== JSON.stringify(journalFiles)) {
    fail("Drizzle journal must match checked-in SQL migration files.");
  }

  for (let index = 0; index < journal.entries.length; index += 1) {
    const current = journal.entries[index]?.when;
    const previous = journal.entries[index - 1]?.when;
    if (typeof current !== "number" || current > Date.now()) {
      fail("Drizzle journal timestamps must not be future-dated.");
    }
    if (typeof previous === "number" && current <= previous) {
      fail("Drizzle journal timestamps must be strictly increasing.");
    }
  }
}

async function fileHashes(directory: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current);
    for (const entry of entries) {
      if (entry === "drizzle.config.ts") {
        continue;
      }

      const fullPath = path.join(current, entry);
      const info = await stat(fullPath);
      if (info.isDirectory()) {
        await visit(fullPath);
      } else {
        const relativePath = path.relative(directory, fullPath);
        hashes.set(relativePath, createHash("sha256").update(await readFile(fullPath)).digest("hex"));
      }
    }
  }

  await visit(directory);
  return hashes;
}

function assertSameHashes(before: Map<string, string>, after: Map<string, string>): void {
  const beforeKeys = [...before.keys()].sort();
  const afterKeys = [...after.keys()].sort();

  if (JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys)) {
    fail("Drizzle schema drift detected; generated migration files differ from committed history.");
  }

  for (const key of beforeKeys) {
    if (before.get(key) !== after.get(key)) {
      fail(`Drizzle schema drift detected in ${key}.`);
    }
  }
}

async function ensureHistoryIsAdditive(): Promise<void> {
  const base = process.env.MIGRATION_BASE_REF ?? "origin/main";

  try {
    await run("git", ["rev-parse", "--verify", base]);
  } catch {
    return;
  }

  const diff = await run("git", ["diff", "--name-status", `${base}...HEAD`, "--", "packages/db/migrations"]);
  for (const line of diff.trim().split("\n").filter(Boolean)) {
    const [status, file] = line.split(/\s+/, 2);
    if (!file) {
      continue;
    }

    if (file.endsWith("packages/db/migrations/meta/_journal.json")) {
      continue;
    }

    if ((file.endsWith(".sql") || file.includes("/meta/")) && status !== "A") {
      fail(`Existing migration history is immutable: ${file} was ${status}.`);
    }
  }

  const currentJournal = await readFile(path.join(migrationsDir, "meta", "_journal.json"), "utf8");
  const previousJournal = await run("git", ["show", `${base}:packages/db/migrations/meta/_journal.json`]).catch(() => "");
  if (previousJournal) {
    const currentEntries = JSON.parse(currentJournal).entries;
    const previousEntries = JSON.parse(previousJournal).entries;
    if (JSON.stringify(currentEntries.slice(0, previousEntries.length)) !== JSON.stringify(previousEntries)) {
      fail("Drizzle journal must be append-only.");
    }
  }
}

async function ensureDriftFree(): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "dayli-drizzle-"));

  try {
    await cp(migrationsDir, tempDir, { recursive: true });
    const before = await fileHashes(tempDir);
    const tempConfig = path.join(tempDir, "drizzle.config.ts");
    await writeFile(
      tempConfig,
      `import { defineConfig } from "drizzle-kit";\nexport default defineConfig({ schema: "${repoPath("packages/db/src/schema/index.ts")}", out: "${tempDir}", dialect: "postgresql", strict: true });\n`,
    );
    await run("pnpm", ["exec", "drizzle-kit", "generate", "--config", tempConfig]);
    const after = await fileHashes(tempDir);
    assertSameHashes(before, after);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function ensureSquawkReviews(): Promise<void> {
  const migrations = await readLocalMigrations();

  for (const migration of migrations) {
    const sql = await readFile(migration.path, "utf8");
    const suppressions = [...sql.matchAll(/squawk-ignore\s+([a-z0-9-]+)/gi)].map((match) => match[1]);

    for (const rule of suppressions) {
      const expected = path.join(reviewsDir, `${path.basename(migration.path, ".sql")}.${rule}.yaml`);
      const review = await readFile(expected, "utf8").catch(() => undefined);

      if (!review) {
        fail(`Missing Squawk review document for ${path.basename(migration.path)} suppression ${rule}.`);
      }

      parseMigrationReview(review, path.basename(expected));
    }
  }

  const output = await run("pnpm", ["exec", "squawk", ...migrations.map((migration) => migration.path)]);
  if (/error|warning/i.test(output)) {
    fail("Squawk reported unsafe migration SQL.");
  }
}

async function main(): Promise<void> {
  await run("pnpm", ["exec", "drizzle-kit", "check", "--config", "drizzle.config.ts"], repoPath("packages/db"));
  await ensureJournalMatchesFiles();
  await ensureHistoryIsAdditive();
  await ensureDriftFree();
  await ensureSquawkReviews();

  const hashes = await readLocalMigrations();
  const hashSummary = createHash("sha256")
    .update(hashes.map((migration) => `${migration.tag}:${migration.hash}`).join("\n"))
    .digest("hex");
  console.log(`Database migration check passed (${hashSummary}).`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database migration check failed.");
  process.exitCode = 1;
}

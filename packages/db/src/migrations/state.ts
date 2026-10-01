import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";
import { migrationsPath } from "./paths";

export interface LocalMigration {
  tag: string;
  path: string;
  hash: string;
}

interface DrizzleJournal {
  entries: Array<{ tag: string }>;
}

export const migrationsFolder = migrationsPath();
export const migrationTableSchema = "drizzle";
export const migrationTableName = "__drizzle_migrations";

export async function readLocalMigrations(directory = migrationsFolder): Promise<LocalMigration[]> {
  const journalPath = path.join(directory, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as DrizzleJournal;

  return Promise.all(
    journal.entries.map(async (entry) => {
      const migrationPath = path.join(directory, `${entry.tag}.sql`);
      const sql = await readFile(migrationPath, "utf8");

      return {
        tag: entry.tag,
        path: migrationPath,
        hash: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export async function readAppliedMigrations(client: Sql): Promise<Array<{ hash: string; created_at: Date | null }>> {
  const rows = await client`
    select hash, created_at
    from drizzle.__drizzle_migrations
    order by id asc
  `;

  return rows.map((row) => ({ hash: String(row.hash), created_at: row.created_at as Date | null }));
}

export async function migrationTableExists(client: Sql): Promise<boolean> {
  const rows = await client`
    select 1
    from information_schema.tables
    where table_schema = ${migrationTableSchema}
      and table_name = ${migrationTableName}
    limit 1
  `;

  return rows.length === 1;
}

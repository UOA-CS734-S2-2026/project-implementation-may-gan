import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { assertAppliedMigrationPrefix } from "./migrations/assert-applied-prefix";
import { migrationsFolder, readAppliedMigrations, readLocalMigrations } from "./migrations/state";

const databaseUrl = process.env.MIGRATION_LINEAGE_TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocalTestUrl(value: string | undefined): string {
  if (!value) throw new Error("MIGRATION_LINEAGE_TEST_DATABASE_URL is required for migration lineage tests.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_migration_lineage_test" || url.username !== "migrator") {
    throw new Error(`MIGRATION_LINEAGE_TEST_DATABASE_URL must target migrator@localhost:${testPostgresPort}/dayli_migration_lineage_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("published-to-candidate migration lineage", () => {
  const connectionString = databaseUrl
    ? requireLocalTestUrl(databaseUrl)
    : `postgresql://migrator:migrator@localhost:${testPostgresPort}/dayli_migration_lineage_test`;
  const client = postgres(connectionString, { max: 1, prepare: false, onnotice: () => undefined });

  afterAll(async () => {
    await client.end({ timeout: 5 });
  });

  it("upgrades a populated published-0014 database through the candidate append-only suffix", async () => {
    const temporaryMigrations = await mkdtemp(path.join(os.tmpdir(), "dayli-published-migrations-"));
    try {
      await cp(migrationsFolder, temporaryMigrations, { recursive: true });
      const journalPath = path.join(temporaryMigrations, "meta", "_journal.json");
      const journal = JSON.parse(await readFile(journalPath, "utf8")) as { entries: unknown[] };
      journal.entries = journal.entries.slice(0, 15);
      await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

      await migrate(drizzle(client), {
        migrationsFolder: temporaryMigrations,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });

      await client`
        insert into public."user" (id, name, email)
        values ('lineage-user', 'Migration Lineage', 'lineage@example.test')
      `;
      await client`
        insert into public.media_reservation (id, owner_id, object_key, content_type, byte_size, status, expires_at, created_at, validated_at)
        values ('lineage-reservation', 'lineage-user', 'private/lineage', 'image/jpeg', 1, 'validated', now() + interval '1 hour', now(), now())
      `;

      const localMigrations = await readLocalMigrations();
      assertAppliedMigrationPrefix(localMigrations, await readAppliedMigrations(client));
      await migrate(drizzle(client), {
        migrationsFolder,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });
      await migrate(drizzle(client), {
        migrationsFolder,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });

      const applied = await readAppliedMigrations(client);
      expect(applied).toHaveLength(localMigrations.length);
      const foreignKeys = await client`
        select confdeltype
        from pg_constraint
        where conname = 'post_media_reservation_id_media_reservation_id_fk'
      `;
      expect(foreignKeys).toEqual([{ confdeltype: "r" }]);
      const indexes = await client`
        select indexdef
        from pg_indexes
        where schemaname = 'public' and indexname = 'post_media_reservation_unique'
      `;
      expect(indexes[0]?.indexdef).toContain("UNIQUE INDEX post_media_reservation_unique");
      expect(indexes[0]?.indexdef).toContain("WHERE (reservation_id IS NOT NULL)");
    } finally {
      await rm(temporaryMigrations, { recursive: true, force: true });
    }
  });
});

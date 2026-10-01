import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { migrationsFolder } from "./migrations/state";

const databaseUrl = process.env.TEST_PRIVACY_PREFLIGHT_DATABASE_URL;
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";

if (process.env.REQUIRE_DB_TEST === "1" && !databaseUrl) {
  throw new Error("TEST_PRIVACY_PREFLIGHT_DATABASE_URL is required for privacy foundation migration preflight.");
}

function requireLocalTestUrl(value: string | undefined): string {
  if (!value) throw new Error("TEST_PRIVACY_PREFLIGHT_DATABASE_URL is required for privacy foundation migration preflight.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_privacy_preflight_test" || url.username !== "migrator") {
    throw new Error(`TEST_PRIVACY_PREFLIGHT_DATABASE_URL must target migrator@localhost:${testPostgresPort}/dayli_privacy_preflight_test.`);
  }
  return value;
}

(databaseUrl ? describe : describe.skip)("privacy and messaging foundation populated-main preflight", () => {
  let client: ReturnType<typeof postgres> | undefined;
  let partialMigrationsDirectory: string | undefined;

  afterAll(async () => {
    await client?.end({ timeout: 5 });
    if (partialMigrationsDirectory) await rm(partialMigrationsDirectory, { recursive: true, force: true });
  });

  it("applies participant identity after populated profile, username, reservation, and avatar history", async () => {
    client = postgres(requireLocalTestUrl(databaseUrl), { max: 1, prepare: false, onnotice: () => undefined });
    partialMigrationsDirectory = await mkdtemp(path.join(os.tmpdir(), "dayli-main-baseline-"));
    await cp(migrationsFolder, partialMigrationsDirectory, { recursive: true });
    const journalPath = path.join(partialMigrationsDirectory, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as { entries: Array<{ idx: number }> };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 19);
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);

    await migrate(drizzle(client), {
      migrationsFolder: partialMigrationsDirectory,
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });

    const userId = `privacy-preflight-${crypto.randomUUID()}`;
    const reservationId = `privacy-preflight-reservation-${crypto.randomUUID()}`;
    await client`
      insert into public."user" (id, name, username, email)
      values (${userId}, 'Privacy Preflight', 'privacy_preflight', ${`${userId}@example.test`})
    `;
    await client`
      insert into public.media_reservation
        (id, owner_id, object_key, content_type, byte_size, status, validated_at, expires_at)
      values
        (${reservationId}, ${userId}, ${`uploads/${reservationId}`}, 'image/png', 1, 'validated', now(), now() + interval '1 hour')
    `;
    await client`
      insert into public.profile_avatars (user_id, reservation_id)
      values (${userId}, ${reservationId})
    `;

    await migrate(drizzle(client), {
      migrationsFolder,
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });

    const profileRows = await client`
      select u.username, a.reservation_id
      from public."user" as u
      join public.profile_avatars as a on a.user_id = u.id
      where u.id = ${userId}
    `;
    expect(profileRows).toEqual([{ username: "privacy_preflight", reservation_id: reservationId }]);
    await expect(client`
      select id, user_id, state
      from public.messaging_participants
      where id = ${userId}
    `).resolves.toEqual([{ id: userId, user_id: userId, state: "active" }]);

    await client`insert into public.account_lifecycles (user_id) values (${userId})`;
    const lifecycleRows = await client`
      select state, generation from public.account_lifecycles where user_id = ${userId}
    `;
    expect(lifecycleRows).toEqual([{ state: "active", generation: "0" }]);
  });
});

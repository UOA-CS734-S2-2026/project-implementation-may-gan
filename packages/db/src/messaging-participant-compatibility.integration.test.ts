import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { migrationsFolder } from "./migrations/state";

const migratorUrl = process.env.TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_DATABASE_URL;
const appUrl = process.env.TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_APP_DATABASE_URL;
const testPostgresPort = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const enabled = Boolean(migratorUrl && appUrl);

if (process.env.REQUIRE_DB_TEST === "1" && !enabled) {
  throw new Error("TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_DATABASE_URL and TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_APP_DATABASE_URL are required for messaging participant compatibility tests.");
}

function requireLocalUrl(value: string | undefined, name: string, user: string): string {
  if (!value) throw new Error(`${name} is required for messaging participant compatibility tests.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== testPostgresPort || url.pathname !== "/dayli_messaging_participant_compatibility_test" || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:${testPostgresPort}/dayli_messaging_participant_compatibility_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("messaging participant compatibility migration", () => {
  const migrator = postgres(requireLocalUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${testPostgresPort}/dayli_messaging_participant_compatibility_test`, "TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_DATABASE_URL", "migrator"), { max: 1, prepare: false, onnotice: () => undefined });
  const app = postgres(requireLocalUrl(appUrl ?? `postgresql://app:app@localhost:${testPostgresPort}/dayli_messaging_participant_compatibility_test`, "TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_APP_DATABASE_URL", "app"), { max: 1, prepare: false, onnotice: () => undefined });
  let baselineMigrations: string | undefined;

  afterAll(async () => {
    await migrator.end({ timeout: 5 });
    await app.end({ timeout: 5 });
    if (baselineMigrations) await rm(baselineMigrations, { recursive: true, force: true });
  });

  it("backfills populated rows and keeps stale user-ID writers compatible", async () => {
    baselineMigrations = await mkdtemp(path.join(os.tmpdir(), "dayli-messaging-compatibility-baseline-"));
    await cp(migrationsFolder, baselineMigrations, { recursive: true });
    const journalPath = path.join(baselineMigrations, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as { entries: Array<{ idx: number }> };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 20);
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    await migrate(drizzle(migrator), {
      migrationsFolder: baselineMigrations,
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });

    const suffix = crypto.randomUUID();
    const alice = `a-compatibility-${suffix}`;
    const bob = `b-compatibility-${suffix}`;
    const charlie = `c-compatibility-${suffix}`;
    const conversation = `conversation-compatibility-${suffix}`;
    const message = `message-compatibility-${suffix}`;
    const outbox = `outbox-compatibility-${suffix}`;
    await app`
      insert into public."user" (id, name, email)
      values
        (${alice}, 'Alice', ${`${alice}@example.test`}),
        (${bob}, 'Bob', ${`${bob}@example.test`}),
        (${charlie}, 'Charlie', ${`${charlie}@example.test`})
    `;
    await app`
      insert into public.conversations
        (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at)
      values
        (${conversation}, 'direct', ${alice}, ${bob}, ${alice}, 'active', 1, 1, now(), now(), now())
    `;
    await app`
      insert into public.conversation_members
        (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at)
      values
        (${conversation}, ${alice}, 0, 0, now(), now()),
        (${conversation}, ${bob}, 0, 0, now(), now())
    `;
    await app`
      insert into public.messages
        (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, created_at)
      values
        (${message}, ${conversation}, 1, ${alice}, 'legacy-message', ${"a".repeat(64)}, 'Legacy message', now())
    `;
    await app`
      insert into public.message_reactions (message_id, user_id, reaction, created_at)
      values (${message}, ${bob}, 'angry', now())
    `;
    await app`
      insert into public.conversation_changes
        (conversation_id, change_sequence, kind, message_id, member_id, created_at)
      values (${conversation}, 1, 'message_sent', ${message}, ${alice}, now())
    `;
    await app`
      insert into public.messaging_outbox
        (id, event_id, recipient_id, conversation_id, change_sequence, channel, available_at, created_at)
      values (${outbox}, 'legacy-event', ${bob}, ${conversation}, 1, 'realtime', now(), now())
    `;

    await migrate(drizzle(migrator), {
      migrationsFolder,
      migrationsSchema: "drizzle",
      migrationsTable: "__drizzle_migrations",
    });

    await expect(migrator`
      select
        c.participant_low_id, c.participant_high_id, c.initiator_participant_id,
        m.sender_participant_id, r.participant_id as reaction_participant_id,
        ch.member_participant_id
      from public.conversations c
      join public.messages m on m.conversation_id = c.id
      join public.message_reactions r on r.message_id = m.id
      join public.conversation_changes ch on ch.conversation_id = c.id
      where c.id = ${conversation}
    `).resolves.toEqual([{
      participant_low_id: alice,
      participant_high_id: bob,
      initiator_participant_id: alice,
      sender_participant_id: alice,
      reaction_participant_id: bob,
      member_participant_id: alice,
    }]);
    await expect(migrator`
      select user_id, participant_id
      from public.conversation_members
      where conversation_id = ${conversation}
      order by user_id
    `).resolves.toEqual([
      { user_id: alice, participant_id: alice },
      { user_id: bob, participant_id: bob },
    ]);
    await expect(migrator`
      select count(*)::int as count
      from public.message_reactions
      where message_id = ${message} and reaction = 'angry' and participant_id = ${bob}
    `).resolves.toEqual([{ count: 1 }]);
    await expect(migrator`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'messaging_outbox_recipient_id_user_id_fk'
    `).resolves.toEqual([{ definition: 'FOREIGN KEY (recipient_id) REFERENCES "user"(id) ON DELETE CASCADE' }]);
    await expect(app`select id from public.messaging_participants`).rejects.toMatchObject({ code: "42501" });
    await expect(app`insert into public.messaging_participants (id, user_id, state) values ('forbidden', ${alice}, 'active')`).rejects.toMatchObject({ code: "42501" });

    const lateConversation = `late-conversation-${suffix}`;
    const lateMessage = `late-message-${suffix}`;
    await app`
      insert into public.conversations
        (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at)
      values
        (${lateConversation}, 'direct', ${alice}, ${charlie}, ${alice}, 'active', 1, 1, now(), now(), now())
    `;
    await app`
      insert into public.conversation_members
        (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at)
      values
        (${lateConversation}, ${alice}, 0, 0, now(), now()),
        (${lateConversation}, ${charlie}, 0, 0, now(), now())
    `;
    await app`
      insert into public.messages
        (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, created_at)
      values
        (${lateMessage}, ${lateConversation}, 1, ${alice}, 'late-legacy-message', ${"b".repeat(64)}, 'Late legacy message', now())
    `;
    await app`
      insert into public.message_reactions (message_id, user_id, reaction, created_at)
      values (${lateMessage}, ${charlie}, 'angry', now())
    `;
    await app`
      insert into public.conversation_changes
        (conversation_id, change_sequence, kind, message_id, member_id, created_at)
      values (${lateConversation}, 1, 'message_sent', ${lateMessage}, ${alice}, now())
    `;
    await app`update public.messages set sender_participant_id = 'wrong-participant' where id = ${lateMessage}`;

    await expect(migrator`
      select
        c.participant_low_id, c.participant_high_id, c.initiator_participant_id,
        m.sender_participant_id, r.participant_id as reaction_participant_id,
        ch.member_participant_id
      from public.conversations c
      join public.messages m on m.conversation_id = c.id
      join public.message_reactions r on r.message_id = m.id
      join public.conversation_changes ch on ch.conversation_id = c.id
      where c.id = ${lateConversation}
    `).resolves.toEqual([{
      participant_low_id: alice,
      participant_high_id: charlie,
      initiator_participant_id: alice,
      sender_participant_id: alice,
      reaction_participant_id: charlie,
      member_participant_id: alice,
    }]);
  });
});

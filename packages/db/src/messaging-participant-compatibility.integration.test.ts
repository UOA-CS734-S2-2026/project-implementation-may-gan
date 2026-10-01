import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { repoPath } from "./migrations/paths";
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

async function waitFor(condition: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

(enabled ? describe : describe.skip)("messaging participant readiness migration", () => {
  const migrator = postgres(requireLocalUrl(migratorUrl ?? `postgresql://migrator:migrator@localhost:${testPostgresPort}/dayli_messaging_participant_compatibility_test`, "TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_DATABASE_URL", "migrator"), { max: 1, prepare: false, onnotice: () => undefined });
  const app = postgres(requireLocalUrl(appUrl ?? `postgresql://app:app@localhost:${testPostgresPort}/dayli_messaging_participant_compatibility_test`, "TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_APP_DATABASE_URL", "app"), { max: 1, prepare: false, onnotice: () => undefined });
  const lifecycleWorker = postgres(`postgresql://lifecycle_worker:lifecycle_worker@localhost:${testPostgresPort}/dayli_messaging_participant_compatibility_test`, { max: 1, prepare: false, onnotice: () => undefined });
  let baselineMigrations: string | undefined;

  afterAll(async () => {
    await migrator.end({ timeout: 5 });
    await app.end({ timeout: 5 });
    await lifecycleWorker.end({ timeout: 5 });
    if (baselineMigrations) await rm(baselineMigrations, { recursive: true, force: true });
  });

  it("makes participant keys durable without disrupting stale user-ID writers", async () => {
    baselineMigrations = await mkdtemp(path.join(os.tmpdir(), "dayli-messaging-compatibility-baseline-"));
    await cp(migrationsFolder, baselineMigrations, { recursive: true });
    const journalPath = path.join(baselineMigrations, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as { entries: Array<{ idx: number }> };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 22);
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
    // 0021 would overwrite a null participant key during an ordinary update.
    // Disable only its user triggers so 0023 must repair these representative
    // legacy rows itself before its checks and uniqueness are validated.
    await migrator`alter table public.conversations disable trigger user`;
    await migrator`alter table public.conversation_members disable trigger user`;
    await migrator`alter table public.messages disable trigger user`;
    await migrator`alter table public.message_reactions disable trigger user`;
    await migrator`alter table public.conversation_changes disable trigger user`;
    try {
      await migrator`update public.conversations set participant_low_id = null where id = ${conversation}`;
      await migrator`update public.conversation_members set participant_id = null where conversation_id = ${conversation} and user_id = ${alice}`;
      await migrator`update public.messages set sender_participant_id = null where id = ${message}`;
      await migrator`update public.message_reactions set participant_id = null where message_id = ${message} and user_id = ${bob}`;
      await migrator`update public.conversation_changes set member_participant_id = null where conversation_id = ${conversation} and change_sequence = 1`;
      await migrator`
        insert into public.conversation_changes (conversation_id, change_sequence, kind, created_at)
        values (${conversation}, 2, 'system_notice', now())
      `;
    } finally {
      await migrator`alter table public.conversations enable trigger user`;
      await migrator`alter table public.conversation_members enable trigger user`;
      await migrator`alter table public.messages enable trigger user`;
      await migrator`alter table public.message_reactions enable trigger user`;
      await migrator`alter table public.conversation_changes enable trigger user`;
    }

    const lockedCapMigrations = await mkdtemp(path.join(os.tmpdir(), "dayli-messaging-readiness-locked-cap-"));
    try {
      await cp(migrationsFolder, lockedCapMigrations, { recursive: true });
      const migrationPath = path.join(lockedCapMigrations, "0023_polite_sway.sql");
      const productionSql = await readFile(migrationPath, "utf8");
      const lockBoundary = 'LOCK TABLE public.conversation_changes IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint';
      if (!productionSql.includes(lockBoundary)) throw new Error("Could not find the 0023 final lock boundary.");
      await writeFile(migrationPath, productionSql.replace(
        lockBoundary,
        `${lockBoundary}\nSELECT set_config('dayli.messaging_0023_size_cap_bytes', '1', true);--> statement-breakpoint`,
      ));
      await expect(migrate(drizzle(migrator), {
        migrationsFolder: lockedCapMigrations,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      })).rejects.toMatchObject({
        cause: { code: "P0001", message: "messaging readiness migration locked size cap exceeded" },
      });
      // The injected low cap is session-scoped when the migrator under test
      // exposes migration statements individually. Restore the normal cap
      // before the following production-SQL interleaving proof.
      await migrator`select set_config('dayli.messaging_0023_size_cap_bytes', '16777216', false)`;
      await expect(migrator`
        select participant_low_id
        from public.conversations
        where id = ${conversation}
      `).resolves.toEqual([{ participant_low_id: null }]);
      await expect(migrator`
        select count(*)::int as count
        from pg_constraint
        where conname in ('conversations_participant_presence_check', 'messages_sender_participant_client_message_unique')
      `).resolves.toEqual([{ count: 0 }]);
    } finally {
      await rm(lockedCapMigrations, { recursive: true, force: true });
    }

    const migrationPid = Number((await migrator`select pg_backend_pid() as pid`)[0]?.pid);
    const migrationFirstMigrations = await mkdtemp(path.join(os.tmpdir(), "dayli-messaging-readiness-migration-first-"));
    const pause = postgres(requireLocalUrl(migratorUrl, "TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_DATABASE_URL", "migrator"), { max: 1, prepare: false, onnotice: () => undefined });
    const migrationFirstWorker = postgres(requireLocalUrl(appUrl, "TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_APP_DATABASE_URL", "app"), { max: 1, prepare: false, onnotice: () => undefined });
    try {
      await cp(migrationsFolder, migrationFirstMigrations, { recursive: true });
      const migrationPath = path.join(migrationFirstMigrations, "0023_polite_sway.sql");
      const productionSql = await readFile(migrationPath, "utf8");
      const lockBoundary = 'LOCK TABLE public.conversation_changes IN ACCESS EXCLUSIVE MODE NOWAIT;--> statement-breakpoint';
      if (!productionSql.includes(lockBoundary)) throw new Error("Could not find the 0023 final lock boundary.");
      await pause`select pg_advisory_lock(174_0023)`;
      await writeFile(migrationPath, `${productionSql.replace(lockBoundary, `${lockBoundary}\nSELECT pg_advisory_lock(174_0023);--> statement-breakpoint\nSELECT pg_advisory_unlock(174_0023);`)}\n--> statement-breakpoint\nSELECT 1 / 0;\n`);
      const migrationOutcome = migrate(drizzle(migrator), {
        migrationsFolder: migrationFirstMigrations,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });
      await waitFor(async () => {
        const [row] = await app`
          select exists(
            select 1 from pg_locks
            where pid = ${migrationPid}
              and relation = 'public.conversations'::regclass
              and mode = 'AccessExclusiveLock'
              and granted
          ) as locked
        `;
        return row?.locked === true;
      }, "Expected the migration to hold the conversation gate.");
      const workerPid = Number((await migrationFirstWorker`select pg_backend_pid() as pid`)[0]?.pid);
      const workerOutcome = migrationFirstWorker.begin(async (tx) => {
        await tx`select id from public.conversations where id = ${conversation} for update`;
        await tx`update public.messages set edited_at = edited_at where id = ${message}`;
        await tx`
          insert into public.message_reactions (message_id, user_id, reaction, created_at)
          values (${message}, ${bob}, 'angry', now())
          on conflict (message_id, user_id) do update set reaction = excluded.reaction
        `;
        await tx`update public.conversation_members set last_read_sequence = last_read_sequence where conversation_id = ${conversation} and user_id = ${alice}`;
        await tx`update public.conversations set updated_at = updated_at where id = ${conversation}`;
      });
      await waitFor(async () => {
        const [row] = await app`select ${migrationPid} = any(pg_blocking_pids(${workerPid})) as blocked`;
        return row?.blocked === true;
      }, "Expected the conversation gate to block the old worker.");
      await pause`select pg_advisory_unlock(174_0023)`;
      await expect(migrationOutcome).rejects.toMatchObject({ cause: { code: "22012" } });
      await expect(workerOutcome).resolves.toBeUndefined();
      await expect(migrator`
        select count(*)::int as count
        from pg_constraint
        where conname in ('conversations_participant_presence_check', 'messages_sender_participant_client_message_unique')
      `).resolves.toEqual([{ count: 0 }]);
      await expect(migrator`
        select pg_get_functiondef('public.dayli_sync_message_participant_reference()'::regprocedure) as definition
      `).resolves.toMatchObject([{ definition: expect.stringContaining('NEW.sender_participant_id := NEW.sender_id') }]);
    } finally {
      await pause`select pg_advisory_unlock_all()`;
      await pause.end({ timeout: 5 });
      await migrationFirstWorker.end({ timeout: 5 });
      await rm(migrationFirstMigrations, { recursive: true, force: true });
    }

    const lowerFirstMigrations = await mkdtemp(path.join(os.tmpdir(), "dayli-messaging-readiness-lower-first-"));
    const lowerFirstWorker = postgres(requireLocalUrl(appUrl, "TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_APP_DATABASE_URL", "app"), { max: 1, prepare: false, onnotice: () => undefined });
    try {
      await cp(migrationsFolder, lowerFirstMigrations, { recursive: true });
      let releaseLowerFirst: (() => void) | undefined;
      let markLowerFirstHeld: (() => void) | undefined;
      const lowerFirstHeld = new Promise<void>((resolve) => { markLowerFirstHeld = resolve; });
      const release = new Promise<void>((resolve) => { releaseLowerFirst = resolve; });
      const workerOutcome = lowerFirstWorker.begin(async (tx) => {
        await tx`update public.messages set edited_at = edited_at where id = ${message}`;
        markLowerFirstHeld?.();
        await release;
        await tx`update public.conversations set updated_at = updated_at where id = ${conversation}`;
      });
      await lowerFirstHeld;
      await expect(migrate(drizzle(migrator), {
        migrationsFolder: lowerFirstMigrations,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      })).rejects.toMatchObject({ cause: { code: "55P03" } });
      releaseLowerFirst?.();
      await expect(workerOutcome).resolves.toBeUndefined();
    } finally {
      await lowerFirstWorker.end({ timeout: 5 });
      await rm(lowerFirstMigrations, { recursive: true, force: true });
    }

    const oldWorker = postgres(requireLocalUrl(appUrl, "TEST_MESSAGING_PARTICIPANT_COMPATIBILITY_APP_DATABASE_URL", "app"), { max: 1, prepare: false, onnotice: () => undefined });
    try {
      const oldWorkerPid = Number((await oldWorker`select pg_backend_pid() as pid`)[0]?.pid);
      let releaseOldWorker: (() => void) | undefined;
      let markOldWorkerHeld: (() => void) | undefined;
      const oldWorkerHeld = new Promise<void>((resolve) => { markOldWorkerHeld = resolve; });
      const release = new Promise<void>((resolve) => { releaseOldWorker = resolve; });
      const oldWorkerOutcome = oldWorker.begin(async (tx) => {
        await tx`select id from public.conversations where id = ${conversation} for update`;
        markOldWorkerHeld?.();
        await release;
        await tx`update public.messages set edited_at = edited_at where id = ${message}`;
        await tx`
          insert into public.message_reactions (message_id, user_id, reaction, created_at)
          values (${message}, ${bob}, 'angry', now())
          on conflict (message_id, user_id) do update set reaction = excluded.reaction
        `;
        await tx`update public.conversation_members set last_read_sequence = last_read_sequence where conversation_id = ${conversation} and user_id = ${alice}`;
        await tx`update public.conversations set updated_at = updated_at where id = ${conversation}`;
      });
      await oldWorkerHeld;
      const migrationOutcome = migrate(drizzle(migrator), {
        migrationsFolder,
        migrationsSchema: "drizzle",
        migrationsTable: "__drizzle_migrations",
      });
      await waitFor(async () => {
        const [row] = await app`select ${oldWorkerPid} = any(pg_blocking_pids(${migrationPid})) as blocked`;
        return row?.blocked === true;
      }, "Expected the readiness migration to wait for the old worker.");
      releaseOldWorker?.();
      await expect(oldWorkerOutcome).resolves.toBeUndefined();
      await expect(migrationOutcome).resolves.toBeUndefined();
    } finally {
      await oldWorker.end({ timeout: 5 });
    }

    await expect(migrator`
      select
        c.participant_low_id, c.participant_high_id, c.initiator_participant_id,
        m.sender_participant_id, r.participant_id as reaction_participant_id,
        ch.member_participant_id
      from public.conversations c
      join public.messages m on m.conversation_id = c.id
      join public.message_reactions r on r.message_id = m.id
      join public.conversation_changes ch on ch.conversation_id = c.id
      where c.id = ${conversation} and ch.member_id = ${alice}
    `).resolves.toEqual([{
      participant_low_id: alice,
      participant_high_id: bob,
      initiator_participant_id: alice,
      sender_participant_id: alice,
      reaction_participant_id: bob,
      member_participant_id: alice,
    }]);
    await expect(migrator`
      select member_id, member_participant_id
      from public.conversation_changes
      where conversation_id = ${conversation} and change_sequence = 2
    `).resolves.toEqual([{ member_id: null, member_participant_id: null }]);
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
    await expect(app`select id, state from public.messaging_participants where id = ${alice}`)
      .resolves.toEqual([{ id: alice, state: "active" }]);
    await expect(app`insert into public.messaging_participants (id, user_id, state) values ('forbidden', ${alice}, 'active')`).rejects.toMatchObject({ code: "42501" });
    await expect(app`update public.messaging_participants set state = 'deleted' where id = ${alice}`).rejects.toMatchObject({ code: "42501" });
    await expect(app`delete from public.messaging_participants where id = ${alice}`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`select id from public.messaging_participants`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`delete from public."user" where false`).rejects.toMatchObject({ code: "42501" });

    const bootstrap = await readFile(repoPath("packages/db/admin/bootstrap-migrator.sql"), "utf8");
    await migrator.unsafe(bootstrap);
    await expect(app`select id, state from public.messaging_participants where id = ${alice}`)
      .resolves.toEqual([{ id: alice, state: "active" }]);
    await expect(app`insert into public.messaging_participants (id, user_id, state) values ('forbidden-after-bootstrap', ${alice}, 'active')`).rejects.toMatchObject({ code: "42501" });
    await expect(app`update public.messaging_participants set state = 'deleted' where id = ${alice}`).rejects.toMatchObject({ code: "42501" });
    await expect(app`delete from public.messaging_participants where id = ${alice}`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`select id from public.messaging_participants`).rejects.toMatchObject({ code: "42501" });
    await expect(lifecycleWorker`delete from public."user" where false`).rejects.toMatchObject({ code: "42501" });

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
      values (${lateMessage}, ${charlie}, 'like', now())
      on conflict (message_id, user_id) do update set reaction = 'angry'
    `;
    await app`
      insert into public.conversation_changes
        (conversation_id, change_sequence, kind, message_id, member_id, created_at)
      values (${lateConversation}, 1, 'message_sent', ${lateMessage}, ${alice}, now())
    `;
    await app`update public.messages set body = 'Legacy update' where id = ${lateMessage}`;
    await expect(app`update public.messages set sender_participant_id = 'wrong-participant' where id = ${lateMessage}`).rejects.toMatchObject({ code: "23514" });
    await expect(app`update public.conversations set participant_low_id = ${charlie} where id = ${lateConversation}`).rejects.toMatchObject({ code: "23514" });
    await expect(app`update public.conversation_members set participant_id = ${charlie} where conversation_id = ${lateConversation} and user_id = ${alice}`).rejects.toMatchObject({ code: "23514" });
    await expect(app`update public.message_reactions set participant_id = ${alice} where message_id = ${lateMessage} and user_id = ${charlie}`).rejects.toMatchObject({ code: "23514" });

    await expect(migrator`
      select
        c.participant_low_id, c.participant_high_id, c.initiator_participant_id,
        m.sender_participant_id, r.participant_id as reaction_participant_id,
        ch.member_participant_id
      from public.conversations c
      join public.messages m on m.conversation_id = c.id
      join public.message_reactions r on r.message_id = m.id
      join public.conversation_changes ch on ch.conversation_id = c.id
      where c.id = ${lateConversation} and ch.member_id = ${alice}
    `).resolves.toEqual([{
      participant_low_id: alice,
      participant_high_id: charlie,
      initiator_participant_id: alice,
      sender_participant_id: alice,
      reaction_participant_id: charlie,
      member_participant_id: alice,
    }]);
    await expect(migrator`
      select conname
      from pg_constraint
      where conname in (
        'conversations_participant_direct_pair_unique',
        'conversation_members_legacy_user_unique',
        'messages_sender_participant_client_message_unique',
        'message_reactions_legacy_user_unique'
      )
      order by conname
    `).resolves.toEqual([
      { conname: 'conversation_members_legacy_user_unique' },
      { conname: 'conversations_participant_direct_pair_unique' },
      { conname: 'message_reactions_legacy_user_unique' },
      { conname: 'messages_sender_participant_client_message_unique' },
    ]);

    const detachSuffix = crypto.randomUUID();
    const low = `a-detach-${detachSuffix}`;
    const high = `b-detach-${detachSuffix}`;
    const nonInitiator = `c-detach-${detachSuffix}`;
    const detachedConversation = `conversation-detach-${detachSuffix}`;
    const detachedMessage = `message-detach-${detachSuffix}`;
    await app`
      insert into public."user" (id, name, email)
      values
        (${low}, 'Low Detach', ${`${low}@example.test`}),
        (${high}, 'High Detach', ${`${high}@example.test`}),
        (${nonInitiator}, 'Noninitiator Detach', ${`${nonInitiator}@example.test`})
    `;
    await app`
      insert into public.conversations
        (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at)
      values (${detachedConversation}, 'direct', ${low}, ${high}, ${low}, 'active', 1, 2, now(), now(), now())
    `;
    await app`
      insert into public.conversation_members
        (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at)
      values
        (${detachedConversation}, ${low}, 0, 0, now(), now()),
        (${detachedConversation}, ${high}, 0, 0, now(), now()),
        (${detachedConversation}, ${nonInitiator}, 0, 0, now(), now())
      on conflict (conversation_id, user_id) do update set updated_at = excluded.updated_at
    `;
    await app`
      insert into public.messages
        (id, conversation_id, sequence, sender_id, client_message_id, request_fingerprint, body, created_at)
      values (${detachedMessage}, ${detachedConversation}, 1, ${low}, 'detachment-legacy-message', ${"d".repeat(64)}, 'Retained message', now())
    `;
    await app`
      insert into public.message_reactions (message_id, user_id, reaction, created_at)
      values (${detachedMessage}, ${nonInitiator}, 'angry', now())
      on conflict (message_id, user_id) do update set reaction = excluded.reaction
    `;
    await app`
      insert into public.conversation_changes
        (conversation_id, change_sequence, kind, message_id, member_id, created_at)
      values
        (${detachedConversation}, 1, 'message_sent', ${detachedMessage}, ${low}, now()),
        (${detachedConversation}, 2, 'member_added', null, ${nonInitiator}, now())
    `;

    await expect(migrator`
      select conname, confdeltype
      from pg_constraint
      where conname in (
        'conversations_user_low_id_user_id_fk', 'conversations_user_high_id_user_id_fk',
        'conversations_initiator_id_user_id_fk', 'conversation_members_user_id_user_id_fk',
        'messages_sender_id_user_id_fk', 'message_reactions_user_id_user_id_fk',
        'conversation_changes_member_id_user_id_fk'
      ) order by conname
    `).resolves.toEqual([
      { conname: 'conversation_changes_member_id_user_id_fk', confdeltype: 'n' },
      { conname: 'conversation_members_user_id_user_id_fk', confdeltype: 'n' },
      { conname: 'conversations_initiator_id_user_id_fk', confdeltype: 'n' },
      { conname: 'conversations_user_high_id_user_id_fk', confdeltype: 'n' },
      { conname: 'conversations_user_low_id_user_id_fk', confdeltype: 'n' },
      { conname: 'message_reactions_user_id_user_id_fk', confdeltype: 'n' },
      { conname: 'messages_sender_id_user_id_fk', confdeltype: 'n' },
    ]);
    await expect(migrator`
      select table_name, column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public' and (table_name, column_name) in (
        ('conversations', 'user_low_id'), ('conversations', 'user_high_id'), ('conversations', 'initiator_id'),
        ('conversation_members', 'user_id'), ('conversation_members', 'participant_id'),
        ('messages', 'sender_id'), ('message_reactions', 'user_id'), ('message_reactions', 'participant_id')
      ) order by table_name, column_name
    `).resolves.toEqual([
      { table_name: 'conversation_members', column_name: 'participant_id', is_nullable: 'NO' },
      { table_name: 'conversation_members', column_name: 'user_id', is_nullable: 'YES' },
      { table_name: 'conversations', column_name: 'initiator_id', is_nullable: 'YES' },
      { table_name: 'conversations', column_name: 'user_high_id', is_nullable: 'YES' },
      { table_name: 'conversations', column_name: 'user_low_id', is_nullable: 'YES' },
      { table_name: 'message_reactions', column_name: 'participant_id', is_nullable: 'NO' },
      { table_name: 'message_reactions', column_name: 'user_id', is_nullable: 'YES' },
      { table_name: 'messages', column_name: 'sender_id', is_nullable: 'YES' },
    ]);
    await expect(migrator`
      select conname, pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname in ('conversation_members_pk', 'message_reactions_pk', 'conversation_members_legacy_user_unique', 'message_reactions_legacy_user_unique')
      order by conname
    `).resolves.toEqual([
      { conname: 'conversation_members_legacy_user_unique', definition: 'UNIQUE (conversation_id, user_id)' },
      { conname: 'conversation_members_pk', definition: 'PRIMARY KEY (conversation_id, participant_id)' },
      { conname: 'message_reactions_legacy_user_unique', definition: 'UNIQUE (message_id, user_id)' },
      { conname: 'message_reactions_pk', definition: 'PRIMARY KEY (message_id, participant_id)' },
    ]);

    // A rolling worker still uses the exact legacy conflict pairs before detach.
    await app`
      insert into public.message_reactions (message_id, user_id, reaction, created_at)
      values (${detachedMessage}, ${nonInitiator}, 'angry', now())
      on conflict (message_id, user_id) do update set reaction = excluded.reaction
    `;
    await expect(app`update public.conversations set participant_low_id = ${high} where id = ${detachedConversation}`).rejects.toMatchObject({ code: '23514' });

    // Detach a noninitiator, then the low initiator and high participant in
    // sequence. FK actions must null only legacy IDs and retain every durable row.
    await migrator`delete from public."user" where id = ${nonInitiator}`;
    await migrator`delete from public."user" where id = ${low}`;
    await migrator`delete from public."user" where id = ${high}`;
    await expect(migrator`
      select
        (select count(*)::int from public.conversations where id = ${detachedConversation}) as conversations,
        (select count(*)::int from public.conversation_members where conversation_id = ${detachedConversation}) as members,
        (select count(*)::int from public.messages where id = ${detachedMessage}) as messages,
        (select count(*)::int from public.message_reactions where message_id = ${detachedMessage} and reaction = 'angry') as reactions,
        (select count(*)::int from public.conversation_changes where conversation_id = ${detachedConversation}) as changes,
        (select count(*)::int from public.conversation_members where conversation_id = ${detachedConversation} and participant_id is not null) as durable_members
    `).resolves.toEqual([{ conversations: 1, members: 3, messages: 1, reactions: 1, changes: 2, durable_members: 3 }]);
    await expect(migrator`
      select user_low_id, user_high_id, initiator_id, participant_low_id, participant_high_id, initiator_participant_id
      from public.conversations where id = ${detachedConversation}
    `).resolves.toEqual([{
      user_low_id: null, user_high_id: null, initiator_id: null,
      participant_low_id: low, participant_high_id: high, initiator_participant_id: low,
    }]);
    await expect(migrator`
      select sender_id, sender_participant_id from public.messages where id = ${detachedMessage}
    `).resolves.toEqual([{ sender_id: null, sender_participant_id: low }]);
    await expect(migrator`
      select user_id, participant_id, reaction from public.message_reactions where message_id = ${detachedMessage}
    `).resolves.toEqual([{ user_id: null, participant_id: nonInitiator, reaction: 'angry' }]);
    await expect(migrator`
      select member_id, member_participant_id from public.conversation_changes
      where conversation_id = ${detachedConversation} order by change_sequence
    `).resolves.toEqual([
      { member_id: null, member_participant_id: low },
      { member_id: null, member_participant_id: nonInitiator },
    ]);
    await app`update public.conversations set updated_at = now() where id = ${detachedConversation}`;
    await app`update public.messages set body = 'Retained message updated' where id = ${detachedMessage}`;
    await app`update public.conversation_members set last_read_sequence = 0 where conversation_id = ${detachedConversation}`;
    await expect(app`update public.messages set sender_id = ${alice} where id = ${detachedMessage}`).rejects.toMatchObject({ code: '23514' });

    // Exercise the database trigger as the app role explicitly, rather than
    // relying on the migrator's ownership privileges.
    await app`set role app`;
    try {
      await expect(app`
        insert into public.conversations
          (id, kind, user_low_id, user_high_id, initiator_id, participant_low_id, participant_high_id, initiator_participant_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at)
        values (${`forbidden-null-conversation-${detachSuffix}`}, 'direct', null, ${charlie}, ${alice}, ${alice}, ${charlie}, ${alice}, 'active', 0, 0, now(), now(), now())
      `).rejects.toMatchObject({ code: '23514' });
      await expect(app`
        insert into public.conversation_members (conversation_id, user_id, participant_id, last_read_sequence, receipt_sequence, created_at, updated_at)
        values (${lateConversation}, null, ${alice}, 0, 0, now(), now())
      `).rejects.toMatchObject({ code: '23514' });
      await expect(app`
        insert into public.messages (id, conversation_id, sequence, sender_id, sender_participant_id, client_message_id, request_fingerprint, body, created_at)
        values (${`forbidden-null-message-${detachSuffix}`}, ${lateConversation}, 2, null, ${alice}, 'forbidden-null', ${"e".repeat(64)}, 'No actor', now())
      `).rejects.toMatchObject({ code: '23514' });
      await expect(app`
        insert into public.message_reactions (message_id, user_id, participant_id, reaction, created_at)
        values (${lateMessage}, null, ${alice}, 'angry', now())
      `).rejects.toMatchObject({ code: '23514' });
      await expect(app`
        insert into public.conversation_changes (conversation_id, change_sequence, kind, member_id, member_participant_id, created_at)
        values (${lateConversation}, 3, 'member_added', null, ${alice}, now())
      `).rejects.toMatchObject({ code: '23514' });
      await expect(app`update public.messages set sender_id = null where id = ${lateMessage}`).rejects.toMatchObject({ code: '23514' });
    } finally {
      await app`reset role`;
    }

    const highInitiatorConversation = `high-initiator-detach-${detachSuffix}`;
    await app`
      insert into public.conversations
        (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at)
      values (${highInitiatorConversation}, 'direct', ${bob}, ${charlie}, ${charlie}, 'active', 0, 0, now(), now(), now())
    `;
    await migrator`delete from public."user" where id = ${charlie}`;
    await expect(migrator`
      select user_low_id, user_high_id, initiator_id, participant_low_id, participant_high_id, initiator_participant_id
      from public.conversations where id = ${highInitiatorConversation}
    `).resolves.toEqual([{
      user_low_id: bob, user_high_id: null, initiator_id: null,
      participant_low_id: bob, participant_high_id: charlie, initiator_participant_id: charlie,
    }]);
  });
});

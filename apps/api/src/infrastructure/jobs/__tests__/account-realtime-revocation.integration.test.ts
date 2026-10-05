import { createDayliDatabase, sql } from "@dayli/db";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createRealtimeRevocationDispatcher, createRealtimeRevocationStore } from "../account-realtime-revocation";

const migratorUrl = process.env.TEST_LIFECYCLE_DATABASE_URL;
const workerUrl = process.env.TEST_LIFECYCLE_WORKER_DATABASE_URL;
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
const enabled = Boolean(migratorUrl && workerUrl);

function localUrl(value: string | undefined, role: string) {
  if (!value) throw new Error("Lifecycle test database URL is required.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_lifecycle_test" || url.username !== role) {
    throw new Error(`Realtime revocation integration requires ${role}@localhost:${port}/dayli_lifecycle_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("realtime revocation PostgreSQL store and dispatcher", () => {
  const migrator = createDayliDatabase(localUrl(migratorUrl, "migrator"));
  const worker = createDayliDatabase(localUrl(workerUrl, "lifecycle_worker"));
  const userId = `realtime-store-${crypto.randomUUID()}`;

  afterAll(async () => {
    try { await migrator.db.execute(sql`delete from public."user" where id = ${userId}`); }
    finally { await worker.close(); await migrator.close(); }
  });

  it("decodes bigint claims and carries the database attempt into bounded retry", async () => {
    const requestedAt = new Date();
    await migrator.db.execute(sql`insert into public."user" (id, name, email)
      values (${userId}, 'Realtime Store', ${`${userId}@example.test`})`);
    await migrator.db.execute(sql`insert into public.account_lifecycles
      (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
      values (${userId}, 'pending_deletion', ${crypto.randomUUID()}, ${"a".repeat(64)}, 7,
        ${requestedAt.toISOString()}::timestamptz, ${new Date(requestedAt.getTime() + 168 * 60 * 60_000).toISOString()}::timestamptz,
        ${new Date(requestedAt.getTime() + 336 * 60 * 60_000).toISOString()}::timestamptz)`);
    await migrator.db.execute(sql`insert into public.account_realtime_revocations
      (user_id, lifecycle_generation, status, attempt_count, next_attempt_at)
      values (${userId}, 7, 'pending', 4, clock_timestamp())`);

    const fetch = vi.fn(async () => { throw new Error("lost acknowledgement"); });
    const namespace = {
      idFromName: (value: string) => value,
      get: () => ({ fetch }),
    } as unknown as DurableObjectNamespace;
    const summary = await createRealtimeRevocationDispatcher({
      store: createRealtimeRevocationStore(worker.db), namespace, random: () => 0, maxAttempts: 12,
    }).dispatchScheduled();

    expect(summary).toMatchObject({ claimed: 1, rescheduled: 1, failed: 0 });
    const [row] = await migrator.db.execute(sql`select attempt_count::text as attempts, status,
      extract(epoch from next_attempt_at - updated_at)::integer as delay
      from public.account_realtime_revocations where user_id = ${userId} and lifecycle_generation = 7`);
    expect(row).toMatchObject({ attempts: "5", status: "pending", delay: 12 });

    await migrator.db.execute(sql`update public.account_realtime_revocations
      set attempt_count = 11, next_attempt_at = clock_timestamp() where user_id = ${userId} and lifecycle_generation = 7`);
    const terminal = await createRealtimeRevocationDispatcher({
      store: createRealtimeRevocationStore(worker.db), namespace, random: () => 0, maxAttempts: 12,
    }).dispatchScheduled();
    expect(terminal).toMatchObject({ claimed: 1, rescheduled: 0, failed: 1 });
    const [failed] = await migrator.db.execute(sql`select status,
      retention_expires_at = completed_at + interval '720 hours' as retained
      from public.account_realtime_revocations where user_id = ${userId} and lifecycle_generation = 7`);
    expect(failed).toEqual({ status: "failed", retained: true });
  });
});

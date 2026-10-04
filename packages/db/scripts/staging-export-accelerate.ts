import postgres, { type TransactionSql } from "postgres";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

type Target = { ownerId: string; requestId: string; email: string; prefix: string };
const ownerPattern = /^[A-Za-z0-9_-]{8,128}$/;
const requestPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateSyntheticTarget(input: {
  ownerId: string | undefined;
  requestId: string | undefined;
  email: string | undefined;
}): Target {
  if (!input.ownerId || !ownerPattern.test(input.ownerId) || !input.requestId ||
      !requestPattern.test(input.requestId) || !input.email || input.email.length > 320 ||
      input.email.trim() !== input.email) throw new Error("Synthetic target is not configured.");
  const digest = createHash("sha256").update(input.requestId).digest("hex");
  return { ownerId: input.ownerId, requestId: input.requestId, email: input.email,
    prefix: `private/data-exports/v2/${digest}/` };
}

export function matchesSyntheticOwner(row: { id: string; email: string } | undefined,
  expected: { ownerId: string; email: string }): boolean {
  return !!row && row.id === expected.ownerId && row.email.toLowerCase() === expected.email.toLowerCase();
}

type Database = ReturnType<typeof postgres>;

async function withSyntheticOwner(sql: Database, target: Target,
  callback: (tx: TransactionSql) => Promise<boolean>): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`set local lock_timeout = '5s'`;
    await tx`set local statement_timeout = '15s'`;
    const [owner] = await tx<{ id: string; email: string }[]>`
      select id, email from public."user" where id = ${target.ownerId} for share`;
    if (!matchesSyntheticOwner(owner, target)) throw new Error("Synthetic account mismatch.");
    return callback(tx);
  });
}

async function expire(sql: Database, target: Target): Promise<void> {
  await withSyntheticOwner(sql, target, async (tx) => {
    const [request] = await tx<{ status: string; requested_at: Date; archive_object_key: string | null;
      archive_cleanup_task_id: string | null }[]>`
      select status, requested_at, archive_object_key, archive_cleanup_task_id from public.data_export_requests
      where id = ${target.requestId} and user_id = ${target.ownerId} for update`;
    if (!request || request.requested_at.getTime() < Date.now() - 3 * 3600_000 ||
        request.status !== "ready" || !request.archive_object_key?.startsWith(target.prefix) ||
        request.archive_cleanup_task_id !== null) throw new Error("Recent synthetic archive is not ready.");
    const tasks = await tx<{ status: string; verified_absent_at: Date | null }[]>`
      select status, verified_absent_at from public.data_export_object_cleanup_tasks
      where archive_object_key = ${request.archive_object_key} limit 2 for update`;
    if (tasks.length !== 1 || tasks[0]?.status !== "pending" || tasks[0]?.verified_absent_at !== null) {
      throw new Error("Synthetic archive has unexpected cleanup state.");
    }
    const result = await tx`
      update public.data_export_requests set ready_at = now() - interval '24 hours 1 minute',
        expires_at = now() - interval '1 minute', updated_at = now()
      where id = ${target.requestId} and user_id = ${target.ownerId} and status = 'ready'`;
    if (result.count !== 1) throw new Error("Synthetic expiry update did not match one request.");
    return true;
  });
}

async function firstPassComplete(sql: Database, target: Target): Promise<boolean> {
  return withSyntheticOwner(sql, target, async (tx) => {
    const [request] = await tx<{ status: string; archive_cleanup_task_id: string | null }[]>`
      select status, archive_cleanup_task_id from public.data_export_requests
      where id = ${target.requestId} and user_id = ${target.ownerId}`;
    if (!request || request.status !== "expired" || !request.archive_cleanup_task_id) return false;
    const [task] = await tx<{ status: string; verified_absent_at: Date | null; archive_object_key: string }[]>`
      select status, verified_absent_at, archive_object_key from public.data_export_object_cleanup_tasks
      where id = ${request.archive_cleanup_task_id}`;
    return !!task && task.status === "pending" && task.archive_object_key.startsWith(target.prefix) &&
      !!task.verified_absent_at && task.verified_absent_at.getTime() >= Date.now() - 3 * 3600_000;
  });
}

async function recheck(sql: Database, target: Target): Promise<void> {
  await withSyntheticOwner(sql, target, async (tx) => {
    const [request] = await tx<{ status: string; archive_cleanup_task_id: string | null }[]>`
      select status, archive_cleanup_task_id from public.data_export_requests
      where id = ${target.requestId} and user_id = ${target.ownerId} for update`;
    if (request?.status !== "expired" || !request.archive_cleanup_task_id) {
      throw new Error("Synthetic first cleanup pass has not completed.");
    }
    const [task] = await tx<{ id: string; status: string; verified_absent_at: Date | null;
      archive_object_key: string }[]>`
      select id, status, verified_absent_at, archive_object_key
      from public.data_export_object_cleanup_tasks where id = ${request.archive_cleanup_task_id} for update`;
    if (!task || task.status !== "pending" || !task.archive_object_key.startsWith(target.prefix) ||
        !task.verified_absent_at || task.verified_absent_at.getTime() < Date.now() - 3 * 3600_000) {
      throw new Error("Synthetic first cleanup pass is not verified.");
    }
    const result = await tx`
      update public.data_export_object_cleanup_tasks
      set verified_absent_at = now() - interval '24 hours 1 minute',
        next_attempt_at = now() - interval '1 minute', updated_at = now()
      where id = ${task.id} and status = 'pending'`;
    if (result.count !== 1) throw new Error("Synthetic recheck update did not match one task.");
    return true;
  });
}

async function terminalCleanupComplete(sql: Database, target: Target): Promise<boolean> {
  return withSyntheticOwner(sql, target, async (tx) => {
    const [request] = await tx<{ id: string }[]>`
      select id from public.data_export_requests where id = ${target.requestId} and user_id = ${target.ownerId}`;
    const [remaining] = await tx<{ count: string }[]>`
      select count(*)::text as count from public.data_export_object_cleanup_tasks
      where archive_object_key like ${`${target.prefix}%`}`;
    return !request && remaining?.count === "0";
  });
}

async function awaitCronPass(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 9 * 60_000;
  do {
    if (await check()) return;
    await delay(15_000);
  } while (Date.now() < deadline);
  throw new Error("Synthetic cleanup did not complete before deadline.");
}

async function run() {
  const target = validateSyntheticTarget({
    ownerId: process.env.STAGING_EXPORT_TEST_OWNER_ID,
    requestId: process.env.STAGING_EXPORT_TEST_REQUEST_ID,
    email: process.env.SMOKE_TEST_EMAIL,
  });
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).username !== "migrator") throw new Error("Migrator target is unavailable.");
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    await expire(sql, target);
    console.log("staging_export_acceleration phase=expiry outcome=passed");
    await awaitCronPass(() => firstPassComplete(sql, target));
    console.log("staging_export_acceleration phase=first_pass outcome=passed");
    await recheck(sql, target);
    console.log("staging_export_acceleration phase=recheck outcome=passed");
    await awaitCronPass(() => terminalCleanupComplete(sql, target));
    console.log("staging_export_acceleration phase=terminal outcome=passed");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("staging-export-accelerate.ts")) {
  run().catch(() => {
    console.error("staging_export_acceleration outcome=refused");
    process.exitCode = 1;
  });
}

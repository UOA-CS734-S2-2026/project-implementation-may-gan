import { createDayliDatabase, schema, sql } from "@dayli/db";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { cancelAccountDeletion, requestAccountDeletion } from "../deletion-commands.repository";
import { readDeletionStatus } from "../deletion-status.repository";

const enabled = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_APP_DATABASE_URL);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
function localUrl(value: string | undefined) {
  if (!value) throw new Error("A local PostgreSQL URL is required.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test") {
    throw new Error(`The deletion command test must use localhost:${port}/dayli_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("inactive deletion commands with PostgreSQL time and restricted app role", () => {
  const migrator = createDayliDatabase(localUrl(process.env.TEST_DATABASE_URL));
  const app = createDayliDatabase(localUrl(process.env.TEST_APP_DATABASE_URL));
  const suffix = crypto.randomUUID();
  const userId = `deletion-owner-${suffix}`;
  const sessionId = `deletion-original-${suffix}`;
  const secondSessionId = `deletion-second-${suffix}`;
  const password = "test-only-deletion-password";
  const idempotencyKey = `idempotency-${suffix}`;
  let credentialHash = "";

  async function issueGrant(session: string, action: "request_deletion" | "cancel_deletion") {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    const [issued] = await app.db.select({ expiresAt: sql<string | null>`public.issue_password_account_management_grant(
      ${userId}, ${session}, ${action}::public.account_management_grant_action, ${digest}, ${credentialHash}
    )` }).from(sql`(values (1)) as grant_fixture`);
    expect(issued?.expiresAt).toBeTruthy();
    return token;
  }

  afterAll(async () => {
    await migrator.db.delete(schema.user).where(eq(schema.user.id, userId));
    await app.close();
    await migrator.close();
  });

  it("atomically suppresses the owner, revokes all sessions and leaves the user for later reviewed purge", async () => {
    await migrator.db.insert(schema.user).values({ id: userId, name: "Deletion Owner", email: `${userId}@example.test` });
    expect(await readDeletionStatus(app.db, userId)).toEqual({
      state: "active", generation: 0, requestId: null,
      requestedAt: null, cancelUntil: null, purgeDueAt: null,
    });
    credentialHash = await hashPassword(password);
    await migrator.db.insert(schema.account).values({
      id: `deletion-credential-${suffix}`, userId, accountId: userId,
      providerId: "credential", password: credentialHash,
    });
    await migrator.db.insert(schema.session).values([
      { id: sessionId, userId, token: `deletion-token-${suffix}`, expiresAt: new Date(Date.now() + 60 * 60_000) },
      { id: secondSessionId, userId, token: `deletion-other-token-${suffix}`, expiresAt: new Date(Date.now() + 60 * 60_000) },
    ]);
    await migrator.db.insert(schema.socketTickets).values({
      tokenHash: suffix.replaceAll("-", "").padEnd(64, "a"), userId, sessionId, expiresAt: new Date(Date.now() + 60_000),
      sessionExpiresAt: new Date(Date.now() + 60 * 60_000), createdAt: new Date(),
    });
    await migrator.db.insert(schema.pushDevices).values({
      id: `push-${suffix}`, userId, sessionId, installationId: `install-${suffix}`,
      platform: "android", token: `encrypted-test-token-${suffix}`,
      tokenHash: suffix.replaceAll("-", "").padEnd(64, "b"), registeredAt: new Date(),
    });
    const proofToken = await issueGrant(sessionId, "request_deletion");
    const requested = await requestAccountDeletion(app.db, { userId, sessionId, grantToken: proofToken, idempotencyKey });
    expect(requested.status).toBe("requested");
    if (requested.status !== "requested") throw new Error("Expected a deletion request.");
    expect(requested.revokedSessionIds.sort()).toEqual([sessionId, secondSessionId].sort());
    expect(requested.cancelUntil.getTime() - requested.requestedAt.getTime()).toBe(168 * 60 * 60_000);
    expect(requested.purgeDueAt.getTime() - requested.requestedAt.getTime()).toBe(336 * 60 * 60_000);
    expect(await readDeletionStatus(app.db, userId)).toMatchObject({
      state: "pending_deletion", requestId: requested.requestId,
      requestedAt: requested.requestedAt, cancelUntil: requested.cancelUntil,
      purgeDueAt: requested.purgeDueAt,
    });
    expect((await migrator.db.select().from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId)))[0]?.state).toBe("pending_deletion");
    expect(await migrator.db.select().from(schema.user).where(eq(schema.user.id, userId))).toHaveLength(1);
    expect(await migrator.db.select().from(schema.session).where(eq(schema.session.userId, userId))).toEqual([]);
    expect(await migrator.db.select().from(schema.socketTickets).where(eq(schema.socketTickets.userId, userId))).toEqual([]);
    expect(await migrator.db.select().from(schema.pushDevices).where(eq(schema.pushDevices.userId, userId))).toEqual([]);
    expect(await migrator.db.select().from(schema.accountRealtimeRevocations)
      .where(eq(schema.accountRealtimeRevocations.userId, userId))).toMatchObject([{
        lifecycleGeneration: 1, status: "pending", attemptCount: 0,
      }]);
    expect(await requestAccountDeletion(app.db, { userId, sessionId, grantToken: proofToken, idempotencyKey }))
      .toEqual({ status: "invalid_grant" });
  });

  it("allows a new restricted session to read the original idempotent result, then cancel with a fresh proof", async () => {
    const restrictedSession = `deletion-restricted-${suffix}`;
    await migrator.db.insert(schema.session).values({
      id: restrictedSession, userId, token: `deletion-restricted-token-${suffix}`,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    const retry = await requestAccountDeletion(app.db, {
      userId, sessionId: restrictedSession, grantToken: "c".repeat(64), idempotencyKey,
    });
    expect(retry.status).toBe("already_requested");
    expect(await requestAccountDeletion(app.db, {
      userId, sessionId: restrictedSession, grantToken: "c".repeat(64), idempotencyKey: `different-${suffix}`,
    })).toEqual({ status: "conflict" });
    const proofToken = await issueGrant(restrictedSession, "cancel_deletion");
    expect(await cancelAccountDeletion(app.db, { userId, sessionId: restrictedSession, grantToken: proofToken }))
      .toEqual({ status: "cancelled", generation: 2 });
    expect((await migrator.db.select().from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId)))[0]?.state).toBe("active");
    const [row] = await migrator.db.select().from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId));
    expect(row).toMatchObject({ state: "active", requestId: null, requestedAt: null, cancelUntil: null, purgeDueAt: null });
    expect(await readDeletionStatus(app.db, userId)).toMatchObject({ state: "active", generation: 2, requestId: null });
    expect(await migrator.db.select().from(schema.session).where(eq(schema.session.userId, userId))).toHaveLength(1);
    expect(await cancelAccountDeletion(app.db, { userId, sessionId: restrictedSession, grantToken: proofToken }))
      .toEqual({ status: "conflict" });
  });

  it("rejects cancellation at or after the database deadline without consuming the proof", async () => {
    const activeSessionId = `deletion-current-${suffix}`;
    await migrator.db.insert(schema.session).values({
      id: activeSessionId, userId, token: `deletion-current-token-${suffix}`,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    const requestGrant = await issueGrant(activeSessionId, "request_deletion");
    const next = await requestAccountDeletion(app.db, {
      userId, sessionId: activeSessionId, grantToken: requestGrant, idempotencyKey: `second-${suffix}`,
    });
    expect(next.status).toBe("requested");
    const pendingSessionId = `deletion-pending-${suffix}`;
    await migrator.db.insert(schema.session).values({
      id: pendingSessionId, userId, token: `deletion-pending-token-${suffix}`,
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    const cancelGrant = await issueGrant(pendingSessionId, "cancel_deletion");
    await migrator.db.update(schema.accountLifecycles).set({
      requestedAt: sql`now() - interval '168 hours'`,
      cancelUntil: sql`now()`,
      purgeDueAt: sql`now() + interval '168 hours'`,
    }).where(eq(schema.accountLifecycles.userId, userId));
    expect(await cancelAccountDeletion(app.db, { userId, sessionId: pendingSessionId, grantToken: cancelGrant }))
      .toEqual({ status: "expired" });
    const [row] = await migrator.db.select().from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, userId));
    expect(row?.state).toBe("pending_deletion");

    const [futureDeadline] = await migrator.db.update(schema.accountLifecycles).set({
      requestedAt: sql`statement_timestamp() - interval '168 hours' + interval '2500 milliseconds'`,
      cancelUntil: sql`statement_timestamp() + interval '2500 milliseconds'`,
      purgeDueAt: sql`statement_timestamp() + interval '168 hours' + interval '2500 milliseconds'`,
    }).where(eq(schema.accountLifecycles.userId, userId))
      .returning({ cancelUntil: schema.accountLifecycles.cancelUntil });
    if (!futureDeadline?.cancelUntil) throw new Error("Expected a database cancellation deadline.");
    const deadlineIso = futureDeadline.cancelUntil.toISOString();
    const [waitingBackend] = await app.db.select({ pid: sql<number>`pg_backend_pid()` })
      .from(sql`(values (1)) as backend_probe`);
    if (!waitingBackend) throw new Error("Expected an app database connection.");

    const blocker = createDayliDatabase(localUrl(process.env.TEST_APP_DATABASE_URL));
    let releaseLock = () => {};
    let signalLocked = () => {};
    const released = new Promise<void>((resolve) => { releaseLock = resolve; });
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const blockerTransaction = blocker.db.transaction(async (transaction) => {
      await transaction.select({ id: schema.user.id }).from(schema.user)
        .where(eq(schema.user.id, userId)).for("update");
      signalLocked();
      await released;
    });
    let waitingCancellation: ReturnType<typeof cancelAccountDeletion> | undefined;
    try {
      await Promise.race([
        locked,
        blockerTransaction.then(() => { throw new Error("The user lock was not held."); }),
      ]);
      waitingCancellation = cancelAccountDeletion(app.db, {
        userId, sessionId: pendingSessionId, grantToken: cancelGrant,
      });
      let blockedBeforeDeadline = false;
      for (let attempt = 0; attempt < 75; attempt += 1) {
        const [probe] = await migrator.db.select({
          waiting: sql<boolean>`cardinality(pg_blocking_pids(${waitingBackend.pid})) > 0`,
          beforeDeadline: sql<boolean>`clock_timestamp() < ${deadlineIso}::timestamptz`,
        }).from(sql`(values (1)) as lock_probe`);
        if (probe?.waiting) {
          expect(probe.beforeDeadline).toBe(true);
          blockedBeforeDeadline = true;
          break;
        }
        if (!probe?.beforeDeadline) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(blockedBeforeDeadline).toBe(true);
      let passedDeadline = false;
      for (let attempt = 0; attempt < 175; attempt += 1) {
        const [probe] = await migrator.db.select({
          passed: sql<boolean>`clock_timestamp() >= ${deadlineIso}::timestamptz`,
        }).from(sql`(values (1)) as deadline_probe`);
        if (probe?.passed) {
          passedDeadline = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(passedDeadline).toBe(true);
      releaseLock();
      expect(await waitingCancellation).toEqual({ status: "expired" });
      const [unchanged] = await migrator.db.select().from(schema.accountLifecycles)
        .where(eq(schema.accountLifecycles.userId, userId));
      expect(unchanged?.state).toBe("pending_deletion");
    } finally {
      releaseLock();
      if (waitingCancellation) await waitingCancellation.catch(() => {});
      await blockerTransaction;
      await blocker.close();
    }
  }, 10_000);
});

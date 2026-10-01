import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../app";
import { createAccountLifecycleRepository } from "./account-lifecycle.repository";

const migratorUrl = process.env.LIFECYCLE_REQUEST_TEST_DATABASE_URL;
const appUrl = process.env.LIFECYCLE_REQUEST_TEST_APP_DATABASE_URL;
const required = process.env.REQUIRE_LIFECYCLE_REQUEST_TEST === "1";
const enabled = Boolean(migratorUrl && appUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function requireLocal(value: string | undefined, name: string, user: string) {
  if (!value) throw new Error(`${name} is required when REQUIRE_LIFECYCLE_REQUEST_TEST=1.`);
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_auth_test" || url.username !== user) {
    throw new Error(`${name} must target ${user}@localhost:${port}/dayli_auth_test.`);
  }
  return value;
}

async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

if (required && !enabled) throw new Error("Lifecycle request integration requires isolated PostgreSQL URLs.");

(enabled ? describe : describe.skip)("account lifecycle request and cancellation repository", () => {
  const migrator = createDayliDatabase(requireLocal(migratorUrl, "LIFECYCLE_REQUEST_TEST_DATABASE_URL", "migrator"));
  const appA = createDayliDatabase(requireLocal(appUrl, "LIFECYCLE_REQUEST_TEST_APP_DATABASE_URL", "app"));
  const appB = createDayliDatabase(requireLocal(appUrl, "LIFECYCLE_REQUEST_TEST_APP_DATABASE_URL", "app"));
  const users: string[] = [];
  const sessions: string[] = [];

  async function fixture(label: string) {
    const userId = `lifecycle-request-${label}-${crypto.randomUUID()}`;
    const sessionId = `lifecycle-session-${crypto.randomUUID()}`;
    users.push(userId);
    sessions.push(sessionId);
    await migrator.db.insert(schema.user).values({ id: userId, name: "Lifecycle fixture", email: `${userId}@example.test` });
    await migrator.db.insert(schema.session).values({ id: sessionId, userId, token: `token-${crypto.randomUUID()}`, expiresAt: sql`now() + interval '1 hour'` });
    return { userId, sessionId };
  }

  async function grant(userId: string, sessionId: string, action: "request_deletion" | "cancel_deletion", generation: number, token = crypto.randomUUID().replaceAll("-", "")) {
    await migrator.db.insert(schema.accountManagementGrants).values({
      tokenDigest: await digest(token), userId, sessionId, action, lifecycleGeneration: generation, expiresAt: sql`now() + interval '10 minutes'`,
    });
    return token;
  }

  async function cleanFixtures() {
    if (users.length === 0) return;
    await migrator.db.delete(schema.friendships).where(sql`${schema.friendships.userId} in ${users} or ${schema.friendships.friendId} in ${users}`);
    await migrator.db.delete(schema.user).where(sql`${schema.user.id} in ${users}`);
  }

  beforeEach(async () => {
    await cleanFixtures();
    users.length = 0;
    sessions.length = 0;
  });

  afterAll(async () => {
    await cleanFixtures();
    await Promise.all([migrator.close(), appA.close(), appB.close()]);
  });

  it("uses PostgreSQL time, consumes a bound proof in the request transaction, and leaves only the restricted proof session", async () => {
    const actor = await fixture("request");
    const otherSession = `lifecycle-other-session-${crypto.randomUUID()}`;
    sessions.push(otherSession);
    await migrator.db.insert(schema.session).values({ id: otherSession, userId: actor.userId, token: `token-${crypto.randomUUID()}`, expiresAt: sql`now() + interval '1 hour'` });
    const proof = await grant(actor.userId, actor.sessionId, "request_deletion", 0);

    const result = await createAccountLifecycleRepository(appA.db).request(actor, proof, "request-idempotency-key");
    expect(result?.view).toMatchObject({ state: "pending_deletion", generation: 0 });
    expect(result?.revokedSessionIds).toEqual([otherSession]);
    const [stored] = await migrator.db.select({
      state: schema.accountLifecycles.state,
      cancelWindow: sql<boolean>`${schema.accountLifecycles.cancelUntil} = ${schema.accountLifecycles.requestedAt} + interval '168 hours'`,
      purgeWindow: sql<boolean>`${schema.accountLifecycles.purgeDueAt} = ${schema.accountLifecycles.requestedAt} + interval '336 hours'`,
      keyDigest: schema.accountLifecycles.idempotencyKeyDigest,
    }).from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, actor.userId));
    expect(stored).toMatchObject({ state: "pending_deletion", cancelWindow: true, purgeWindow: true, keyDigest: await digest("request-idempotency-key") });
    const remaining = await migrator.db.select({ id: schema.session.id }).from(schema.session).where(eq(schema.session.userId, actor.userId));
    expect(remaining).toEqual([{ id: actor.sessionId }]);
    expect(await createAccountLifecycleRepository(appA.db).request(actor, proof)).toMatchObject({ view: { state: "pending_deletion" } });
  });

  it("rejects wrong-action, stale-generation, and replayed proofs without changing lifecycle state", async () => {
    const actor = await fixture("proof");
    const wrongAction = await grant(actor.userId, actor.sessionId, "cancel_deletion", 0);
    expect(await createAccountLifecycleRepository(appA.db).request(actor, wrongAction)).toBeNull();
    const stale = await grant(actor.userId, actor.sessionId, "request_deletion", 1);
    expect(await createAccountLifecycleRepository(appA.db).request(actor, stale)).toBeNull();
    expect(await createAccountLifecycleRepository(appA.db).status(actor.userId)).toEqual({ state: "active", generation: 0 });

    const proof = await grant(actor.userId, actor.sessionId, "request_deletion", 0);
    expect((await createAccountLifecycleRepository(appA.db).request(actor, proof))?.view.state).toBe("pending_deletion");
    const row = await createAccountLifecycleRepository(appA.db).status(actor.userId);
    expect(row.state).toBe("pending_deletion");
  });

  it("cancels only before the database boundary, increments generation, and revokes the current session", async () => {
    const actor = await fixture("cancel");
    const requestProof = await grant(actor.userId, actor.sessionId, "request_deletion", 0);
    await createAccountLifecycleRepository(appA.db).request(actor, requestProof);
    const cancelProof = await grant(actor.userId, actor.sessionId, "cancel_deletion", 0);
    const result = await createAccountLifecycleRepository(appA.db).cancel(actor, cancelProof);
    expect(result).toMatchObject({ view: { state: "active", generation: 1 }, revokedSessionIds: [actor.sessionId] });
    expect(await createAccountLifecycleRepository(appA.db).cancel(actor, cancelProof)).toBeNull();
    expect(await createAccountLifecycleRepository(appA.db).request(actor, requestProof)).toBeNull();
    const currentSessions = await migrator.db.select({ id: schema.session.id }).from(schema.session).where(eq(schema.session.userId, actor.userId));
    expect(currentSessions).toEqual([]);
  });

  it("rejects cancellation at the exact PostgreSQL boundary without consuming its proof", async () => {
    const actor = await fixture("boundary");
    const requestProof = await grant(actor.userId, actor.sessionId, "request_deletion", 0);
    await createAccountLifecycleRepository(appA.db).request(actor, requestProof);
    await migrator.db.update(schema.accountLifecycles).set({
      requestedAt: sql`now() - interval '168 hours'`,
      cancelUntil: sql`now()`,
      purgeDueAt: sql`now() + interval '168 hours'`,
    }).where(eq(schema.accountLifecycles.userId, actor.userId));
    const cancelProof = await grant(actor.userId, actor.sessionId, "cancel_deletion", 0);
    expect(await createAccountLifecycleRepository(appA.db).cancel(actor, cancelProof)).toBeNull();
    const [lifecycle] = await migrator.db.select({ state: schema.accountLifecycles.state }).from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, actor.userId));
    expect(lifecycle?.state).toBe("pending_deletion");
    const [storedGrant] = await migrator.db.select({ consumedAt: schema.accountManagementGrants.consumedAt }).from(schema.accountManagementGrants)
      .where(and(eq(schema.accountManagementGrants.userId, actor.userId), eq(schema.accountManagementGrants.action, "cancel_deletion")));
    expect(storedGrant?.consumedAt).toBeNull();
  });

  it("serializes cross-user existing-message writes with an actual request and cancellation", async () => {
    const actor = await fixture("message-actor");
    const target = await fixture("message-target");
    await migrator.db.insert(schema.friendships).values([
      { userId: actor.userId, friendId: target.userId, state: "active", stateChangedAt: new Date() },
      { userId: target.userId, friendId: actor.userId, state: "active", stateChangedAt: new Date() },
    ]);
    const persistence = createMessagingPersistenceServices(appA.db);
    const direct = await persistence.direct.create(actor.userId, {
      recipientId: target.userId, clientMessageId: crypto.randomUUID(), text: "retained first message",
    });
    const requestProof = await grant(target.userId, target.sessionId, "request_deletion", 0);
    expect((await createAccountLifecycleRepository(appB.db).request(target, requestProof))?.view.state).toBe("pending_deletion");

    await expect(persistence.send.send(actor.userId, direct.conversation.id, {
      clientMessageId: crypto.randomUUID(), text: "must not write after pending",
    })).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(persistence.set.set(actor.userId, direct.conversation.id, direct.message.id, "love"))
      .rejects.toMatchObject({ code: "BLOCKED" });
    // The approved retention policy keeps existing message history intact.
    await expect(persistence.getMessage.get(actor.userId, direct.conversation.id, direct.message.id))
      .resolves.toMatchObject({ id: direct.message.id, text: "retained first message" });

    const cancelProof = await grant(target.userId, target.sessionId, "cancel_deletion", 0);
    expect((await createAccountLifecycleRepository(appB.db).cancel(target, cancelProof))?.view)
      .toMatchObject({ state: "active", generation: 1 });
    await expect(persistence.send.send(actor.userId, direct.conversation.id, {
      clientMessageId: crypto.randomUUID(), text: "allowed after cancellation",
    })).resolves.toMatchObject({ replayed: false, message: { text: "allowed after cancellation" } });
  });

  it("serializes two physical app connections around a one-time request proof", async () => {
    const actor = await fixture("race");
    const proof = await grant(actor.userId, actor.sessionId, "request_deletion", 0);
    const [first, second] = await Promise.all([
      createAccountLifecycleRepository(appA.db).request(actor, proof),
      createAccountLifecycleRepository(appB.db).request(actor, proof),
    ]);
    expect([first?.view.state, second?.view.state]).toEqual(["pending_deletion", "pending_deletion"]);
    const [lifecycle] = await migrator.db.select({ state: schema.accountLifecycles.state, generation: schema.accountLifecycles.generation })
      .from(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, actor.userId));
    expect(lifecycle).toEqual({ state: "pending_deletion", generation: 0 });
    const grants = await migrator.db.select({ consumedAt: schema.accountManagementGrants.consumedAt }).from(schema.accountManagementGrants)
      .where(and(eq(schema.accountManagementGrants.userId, actor.userId), eq(schema.accountManagementGrants.action, "request_deletion")));
    expect(grants).toHaveLength(1);
    expect(grants[0]?.consumedAt).not.toBeNull();
  });
});

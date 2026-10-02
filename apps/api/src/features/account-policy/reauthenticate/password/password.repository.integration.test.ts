import { createDayliDatabase, schema, sql } from "@dayli/db";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { issuePasswordManagementGrant } from "./password.repository";

const migratorUrl = process.env.TEST_DATABASE_URL;
const appUrl = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(migratorUrl && appUrl);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";

function localUrl(value: string | undefined) {
  if (!value) throw new Error("A local PostgreSQL URL is required.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test") {
    throw new Error(`The reauthentication test must use localhost:${port}/dayli_test.`);
  }
  return value;
}

(enabled ? describe : describe.skip)("password management grants with the restricted app role", () => {
  const migrator = createDayliDatabase(localUrl(migratorUrl));
  const app = createDayliDatabase(localUrl(appUrl));
  const id = crypto.randomUUID();
  const ownerId = `grant-owner-${id}`;
  const googleId = `grant-google-${id}`;
  const ownerSessionId = `grant-session-${id}`;
  const otherSessionId = `grant-other-session-${id}`;
  const password = "test-only-current-password";
  let credentialHash = "";

  afterAll(async () => {
    await migrator.db.delete(schema.user).where(eq(schema.user.id, ownerId));
    await migrator.db.delete(schema.user).where(eq(schema.user.id, googleId));
    await app.close();
    await migrator.close();
  });

  it("issues only after real Better Auth password verification and keeps the grant table inaccessible", async () => {
    credentialHash = await hashPassword(password);
    await migrator.db.insert(schema.user).values([
      { id: ownerId, name: "Owner", email: `${ownerId}@example.test` },
      { id: googleId, name: "Google-only", email: `${googleId}@example.test` },
    ]);
    await migrator.db.insert(schema.account).values([
      { id: `credential-${id}`, accountId: ownerId, userId: ownerId, providerId: "credential", password: credentialHash },
      { id: `google-linked-${id}`, accountId: `google-sub-${id}`, userId: ownerId, providerId: "google" },
      { id: `google-only-${id}`, accountId: `google-only-sub-${id}`, userId: googleId, providerId: "google" },
    ]);
    await migrator.db.insert(schema.session).values([
      { id: ownerSessionId, userId: ownerId, token: `grant-owner-token-${id}`, expiresAt: new Date(Date.now() + 10 * 60_000) },
      { id: otherSessionId, userId: googleId, token: `grant-other-token-${id}`, expiresAt: new Date(Date.now() + 10 * 60_000) },
    ]);

    expect(await issuePasswordManagementGrant(app.db, { userId: ownerId, sessionId: ownerSessionId, action: "request_deletion", password: "wrong" }))
      .toEqual({ status: "invalid_password" });
    expect(await issuePasswordManagementGrant(app.db, { userId: googleId, sessionId: otherSessionId, action: "request_deletion", password }))
      .toEqual({ status: "password_unavailable" });
    expect(await issuePasswordManagementGrant(app.db, { userId: ownerId, sessionId: otherSessionId, action: "request_deletion", password }))
      .toEqual({ status: "restricted" });
    const issued = await issuePasswordManagementGrant(app.db, { userId: ownerId, sessionId: ownerSessionId, action: "request_deletion", password });
    expect(issued.status).toBe("issued");
    if (issued.status !== "issued") throw new Error("Expected a password grant.");
    expect(issued.expiresAt).toBeInstanceOf(Date);
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(issued.expiresAt.getTime()).toBeLessThan(Date.now() + 6 * 60_000);
    await expect(app.db.select().from(schema.accountManagementGrants)).rejects.toThrow();
    const [stored] = await migrator.db.select().from(schema.accountManagementGrants)
      .where(eq(schema.accountManagementGrants.userId, ownerId));
    expect(stored?.tokenDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.tokenDigest).not.toBe(issued.token);
    expect(stored?.lifecycleGeneration).toBe(0);
  });

  it("fences the current session, action, generation and single-use replay", async () => {
    const issued = await issuePasswordManagementGrant(app.db, { userId: ownerId, sessionId: ownerSessionId, action: "request_deletion", password });
    expect(issued.status).toBe("issued");
    if (issued.status !== "issued") throw new Error("Expected a password grant.");
    const tokenDigest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(issued.token))),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    const consume = (userId: string, sessionId: string, action: string) => app.db.select({ accepted: sql<boolean>`public.consume_account_management_grant(
      ${userId}, ${sessionId}, ${action}::public.account_management_grant_action, ${tokenDigest}
    )` }).from(sql`(values (1)) as grant_request`).then((rows) => rows[0]?.accepted);
    expect(await consume(ownerId, otherSessionId, "request_deletion")).toBe(false);
    expect(await consume(ownerId, ownerSessionId, "cancel_deletion")).toBe(false);
    const [first, second] = await Promise.all([
      consume(ownerId, ownerSessionId, "request_deletion"),
      consume(ownerId, ownerSessionId, "request_deletion"),
    ]);
    expect([first, second].sort()).toEqual([false, true]);
    expect(await consume(ownerId, ownerSessionId, "request_deletion")).toBe(false);
  });

  it("does not allow a grant from an earlier lifecycle generation", async () => {
    const issued = await issuePasswordManagementGrant(app.db, { userId: ownerId, sessionId: ownerSessionId, action: "request_deletion", password });
    expect(issued.status).toBe("issued");
    if (issued.status !== "issued") throw new Error("Expected a password grant.");
    const requestedAt = new Date();
    await migrator.db.insert(schema.accountLifecycles).values({
      userId: ownerId, state: "pending_deletion", requestId: `grant-request-${id}`,
      idempotencyKeyDigest: "a".repeat(64), generation: 1, requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60_000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60_000),
    });
    expect(await issuePasswordManagementGrant(app.db, { userId: ownerId, sessionId: ownerSessionId, action: "request_deletion", password }))
      .toEqual({ status: "restricted" });
    const cancellation = await issuePasswordManagementGrant(app.db, { userId: ownerId, sessionId: ownerSessionId, action: "cancel_deletion", password });
    expect(cancellation.status).toBe("issued");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(issued.token))),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    const [stale] = await app.db.select({ accepted: sql<boolean>`public.consume_account_management_grant(
      ${ownerId}, ${ownerSessionId}, 'request_deletion'::public.account_management_grant_action, ${digest}
    )` }).from(sql`(values (1)) as grant_request`);
    expect(stale?.accepted).toBe(false);
    await migrator.db.delete(schema.session).where(eq(schema.session.id, ownerSessionId));
    expect(await issuePasswordManagementGrant(app.db, { userId: ownerId, sessionId: ownerSessionId, action: "cancel_deletion", password }))
      .toEqual({ status: "restricted" });
  });
});

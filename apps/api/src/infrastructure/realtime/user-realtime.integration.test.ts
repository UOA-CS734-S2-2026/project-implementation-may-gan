import { createDayliDatabase, sql } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserRealtime } from "./user-realtime";

const connectionString = process.env.MESSAGING_DELIVERY_TEST_DATABASE_URL ?? process.env.MESSAGING_TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : undefined;
if (target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("Realtime integration tests must use the isolated dayli_messaging_test database.");
}
const suite = connectionString ? describe : describe.skip;

type Attachment = { userId: string; sessionId: string; expiresAt: string; version: 1 };
type RealtimeWithSessionCheck = { sessionIsActive: (attachment: Attachment) => Promise<boolean> };

suite("UserRealtime session authorization", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/realtime_tests");
  const ids = {
    user: `realtime-user-${crypto.randomUUID()}`,
    activeSession: `realtime-active-session-${crypto.randomUUID()}`,
    expiredSession: `realtime-expired-session-${crypto.randomUUID()}`,
  };
  const createdAt = new Date().toISOString();
  const activeExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const expiredExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const realtime = new UserRealtime({} as DurableObjectState, {
    HYPERDRIVE: { connectionString: connectionString ?? "postgresql://invalid/realtime_tests" },
  });
  const sessionIsActive = (realtime as unknown as RealtimeWithSessionCheck).sessionIsActive.bind(realtime);

  function attachment(sessionId: string, expiresAt = activeExpiry, userId = ids.user): Attachment {
    return { userId, sessionId, expiresAt, version: 1 };
  }

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) values (${ids.user}, ${ids.user}, ${ids.user + "@example.test"})`;
    await database.client`insert into public.session (id, expires_at, token, created_at, updated_at, user_id) values (${ids.activeSession}, ${activeExpiry}, ${`token-${ids.activeSession}`}, ${createdAt}, ${createdAt}, ${ids.user}), (${ids.expiredSession}, ${expiredExpiry}, ${`token-${ids.expiredSession}`}, ${createdAt}, ${createdAt}, ${ids.user})`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = ${ids.user}`;
    } finally {
      await database.close();
    }
  });

  it("requires a matching unexpired session and rejects an expired attachment or revoked session", async () => {
    await expect(sessionIsActive(attachment(ids.activeSession))).resolves.toBe(true);
    await expect(sessionIsActive(attachment(ids.activeSession, expiredExpiry))).resolves.toBe(false);
    await expect(sessionIsActive(attachment(ids.activeSession, activeExpiry, `other-${ids.user}`))).resolves.toBe(false);
    await expect(sessionIsActive(attachment(ids.expiredSession, activeExpiry))).resolves.toBe(false);

    await database.db.execute(sql`delete from public.session where id = ${ids.activeSession}`);
    await expect(sessionIsActive(attachment(ids.activeSession))).resolves.toBe(false);
  });
});

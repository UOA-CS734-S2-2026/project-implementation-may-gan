import { createDayliDatabase, schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresRealtimeTicketStore } from "../issue-ticket.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("realtime ticket Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const firstConsumer = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const secondConsumer = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const userId = `issue-ticket-user-${crypto.randomUUID()}`;
  const store = createPostgresRealtimeTicketStore(database.db);
  const firstStore = createPostgresRealtimeTicketStore(firstConsumer.db);
  const secondStore = createPostgresRealtimeTicketStore(secondConsumer.db);

  beforeAll(async () => {
    await database.db.insert(schema.user).values({ id: userId, name: userId, email: `${userId}@example.test` });
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.user).where(eq(schema.user.id, userId));
    } finally {
      await Promise.all([database.close(), firstConsumer.close(), secondConsumer.close()]);
    }
  });

  it("allows exactly one concurrent consumer to claim a live ticket", async () => {
    const tokenHash = crypto.randomUUID().replaceAll("-", "");
    const now = new Date("2030-01-01T00:00:00.000Z");
    await store.insert({
      tokenHash,
      userId,
      sessionId: `issue-ticket-session-${crypto.randomUUID()}`,
      expiresAt: new Date("2030-01-01T00:01:00.000Z"),
      sessionExpiresAt: new Date("2030-01-01T01:00:00.000Z"),
    });

    const results = await Promise.all([
      firstStore.consume(tokenHash, now),
      secondStore.consume(tokenHash, now),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(results.find((result) => result !== null)).toMatchObject({ tokenHash, userId });
  });

  it("uses the supplied consumption time for ticket and session expiry", async () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    const expiredTicketHash = crypto.randomUUID().replaceAll("-", "");
    const expiredSessionHash = crypto.randomUUID().replaceAll("-", "");
    await Promise.all([
      store.insert({
        tokenHash: expiredTicketHash,
        userId,
        sessionId: `issue-ticket-session-${crypto.randomUUID()}`,
        expiresAt: new Date("2029-12-31T23:59:59.000Z"),
        sessionExpiresAt: new Date("2030-01-01T01:00:00.000Z"),
      }),
      store.insert({
        tokenHash: expiredSessionHash,
        userId,
        sessionId: `issue-ticket-session-${crypto.randomUUID()}`,
        expiresAt: new Date("2030-01-01T01:00:00.000Z"),
        sessionExpiresAt: new Date("2029-12-31T23:59:59.000Z"),
      }),
    ]);

    await expect(store.consume(expiredTicketHash, now)).resolves.toBeNull();
    await expect(store.consume(expiredSessionHash, now)).resolves.toBeNull();
  });
});

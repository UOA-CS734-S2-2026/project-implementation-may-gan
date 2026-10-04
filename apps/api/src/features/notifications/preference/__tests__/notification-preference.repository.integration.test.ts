import { createDayliDatabase, schema } from "@dayli/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresNotificationPreferenceStore } from "../notification-preference.repository";

const connectionString = process.env.TEST_APP_DATABASE_URL;
const enabled = Boolean(connectionString);
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
if (connectionString) {
  const target = new URL(connectionString);
  if (target.hostname !== "localhost" || target.port !== port || target.pathname !== "/dayli_test") {
    throw new Error(`TEST_APP_DATABASE_URL must target localhost:${port}/dayli_test.`);
  }
}

(enabled ? describe : describe.skip)("notification preference Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/notification-preference");
  const userId = `notification-preference-repository-${crypto.randomUUID()}`;
  const store = createPostgresNotificationPreferenceStore(database.db);

  beforeAll(async () => {
    await database.db.insert(schema.user).values({ id: userId, name: userId, email: `${userId}@example.test` });
  });

  afterAll(async () => {
    const migrator = createDayliDatabase(process.env.TEST_DATABASE_URL!);
    try {
      await migrator.db.delete(schema.user).where(eq(schema.user.id, userId));
    } finally {
      await Promise.all([migrator.close(), database.close()]);
    }
  });

  it("returns false without a row and upserts the verified owner's value", async () => {
    expect(await store.read(userId)).toBe(false);
    expect(await store.write(userId, true)).toBe(true);
    expect(await store.read(userId)).toBe(true);
    expect(await store.write(userId, false)).toBe(false);
    expect(await store.read(userId)).toBe(false);
  });
});

import { createDayliDatabase, schema } from "@dayli/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresUnregisterDeviceRepository } from "../unregister-device.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("unregister device Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const ids = {
    alice: `unregister-device-alice-${crypto.randomUUID()}`,
    bob: `unregister-device-bob-${crypto.randomUUID()}`,
  };
  const repository = createPostgresUnregisterDeviceRepository(database.db);

  beforeAll(async () => {
    const now = new Date();
    await database.db.insert(schema.user).values([
      { id: ids.alice, name: ids.alice, email: `${ids.alice}@example.test` },
      { id: ids.bob, name: ids.bob, email: `${ids.bob}@example.test` },
    ]);
    await database.db.insert(schema.pushDevices).values([
      {
        id: `unregister-device-alice-device-${crypto.randomUUID()}`,
        userId: ids.alice,
        sessionId: "session-alice",
        installationId: "shared-installation",
        platform: "ios",
        token: "ciphertext-alice",
        tokenHash: "a".repeat(64),
        optedIn: true,
        registeredAt: now,
      },
      {
        id: `unregister-device-bob-device-${crypto.randomUUID()}`,
        userId: ids.bob,
        sessionId: "session-bob",
        installationId: "shared-installation",
        platform: "android",
        token: "ciphertext-bob",
        tokenHash: "b".repeat(64),
        optedIn: true,
        registeredAt: now,
      },
      {
        id: `unregister-device-bob-only-device-${crypto.randomUUID()}`,
        userId: ids.bob,
        sessionId: "session-bob",
        installationId: "bob-only-installation",
        platform: "android",
        token: "ciphertext-bob-only",
        tokenHash: "c".repeat(64),
        optedIn: true,
        registeredAt: now,
      },
    ]);
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.user).where(inArray(schema.user.id, [ids.alice, ids.bob]));
    } finally {
      await database.close();
    }
  });

  it("deletes only the verified actor's installation", async () => {
    await repository.unregister(ids.alice, "shared-installation");

    const rows = await database.db.select({ user_id: schema.pushDevices.userId })
      .from(schema.pushDevices)
      .where(eq(schema.pushDevices.installationId, "shared-installation"))
      .orderBy(schema.pushDevices.userId);
    expect(rows).toEqual([{ user_id: ids.bob }]);
  });

  it("does not delete an installation owned by another actor", async () => {
    await repository.unregister(ids.alice, "bob-only-installation");

    const rows = await database.db.select({ user_id: schema.pushDevices.userId })
      .from(schema.pushDevices)
      .where(eq(schema.pushDevices.installationId, "bob-only-installation"));
    expect(rows).toEqual([{ user_id: ids.bob }]);
  });

  it("is a no-op when the installation is missing", async () => {
    await expect(repository.unregister(ids.bob, "missing-installation")).resolves.toBeUndefined();

    const rows = await database.db.select({ user_id: schema.pushDevices.userId })
      .from(schema.pushDevices)
      .where(eq(schema.pushDevices.installationId, "bob-only-installation"));
    expect(rows).toEqual([{ user_id: ids.bob }]);
  });
});

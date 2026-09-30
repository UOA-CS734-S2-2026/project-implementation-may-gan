import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresRegisterDeviceStore } from "../register-device.repository";
import { PushSessionInactiveError } from "../register-device.service";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("register device Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const ids = {
    alice: `register-device-alice-${crypto.randomUUID()}`,
    bob: `register-device-bob-${crypto.randomUUID()}`,
    aliceSession: `register-device-alice-session-${crypto.randomUUID()}`,
    aliceSessionTwo: `register-device-alice-session-${crypto.randomUUID()}`,
    bobSession: `register-device-bob-session-${crypto.randomUUID()}`,
  };
  const store = createPostgresRegisterDeviceStore(database.db);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const now = new Date("2026-09-29T11:00:00.000Z");
  const tokenHash = (value: string) => value.repeat(64).slice(0, 64);

  function device(input: {
    id: string;
    userId: string;
    sessionId: string;
    installationId: string;
    tokenHash: string;
  }) {
    return {
      ...input,
      platform: "ios" as const,
      tokenCiphertext: `ciphertext-${input.id}`,
      tokenKeyVersion: "test",
      optedIn: true,
      now,
    };
  }

  beforeAll(async () => {
    const createdAt = new Date();
    await database.db.insert(schema.user).values([
      { id: ids.alice, name: ids.alice, email: `${ids.alice}@example.test` },
      { id: ids.bob, name: ids.bob, email: `${ids.bob}@example.test` },
    ]);
    await database.db.insert(schema.session).values([
      {
        id: ids.aliceSession,
        expiresAt,
        token: `token-${ids.alice}`,
        createdAt,
        updatedAt: createdAt,
        userId: ids.alice,
      },
      {
        id: ids.aliceSessionTwo,
        expiresAt,
        token: `token-${ids.alice}-two`,
        createdAt,
        updatedAt: createdAt,
        userId: ids.alice,
      },
      {
        id: ids.bobSession,
        expiresAt,
        token: `token-${ids.bob}`,
        createdAt,
        updatedAt: createdAt,
        userId: ids.bob,
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

  it("rotates a provider token to the account that most recently registers it", async () => {
    const hash = tokenHash("a");
    await store.register(device({
      id: `register-device-alice-device-${crypto.randomUUID()}`,
      userId: ids.alice,
      sessionId: ids.aliceSession,
      installationId: "alice-installation",
      tokenHash: hash,
    }));
    await store.register(device({
      id: `register-device-bob-device-${crypto.randomUUID()}`,
      userId: ids.bob,
      sessionId: ids.bobSession,
      installationId: "bob-installation",
      tokenHash: hash,
    }));

    const rows = await database.db.select({
      user_id: schema.pushDevices.userId,
      installation_id: schema.pushDevices.installationId,
      token: schema.pushDevices.token,
      token_ciphertext: schema.pushDevices.tokenCiphertext,
      token_key_version: schema.pushDevices.tokenKeyVersion,
    }).from(schema.pushDevices).where(eq(schema.pushDevices.tokenHash, hash));
    expect(rows).toEqual([{
      user_id: ids.bob,
      installation_id: "bob-installation",
      token: expect.stringContaining("ciphertext-register-device-bob-device-"),
      token_ciphertext: expect.stringContaining("ciphertext-register-device-bob-device-"),
      token_key_version: "test",
    }]);
  });

  it("atomically upserts one installation during concurrent session registrations", async () => {
    const firstDatabase = createDayliDatabase(connectionString!);
    const secondDatabase = createDayliDatabase(connectionString!);
    const firstStore = createPostgresRegisterDeviceStore(firstDatabase.db);
    const secondStore = createPostgresRegisterDeviceStore(secondDatabase.db);
    const installationId = `concurrent-installation-${crypto.randomUUID()}`;
    const firstDevice = device({
      id: `register-device-concurrent-first-${crypto.randomUUID()}`,
      userId: ids.alice,
      sessionId: ids.aliceSession,
      installationId,
      tokenHash: tokenHash("d"),
    });
    const secondDevice = device({
      id: `register-device-concurrent-second-${crypto.randomUUID()}`,
      userId: ids.alice,
      sessionId: ids.aliceSessionTwo,
      installationId,
      tokenHash: tokenHash("e"),
    });

    try {
      await Promise.all([
        firstStore.register(firstDevice),
        secondStore.register(secondDevice),
      ]);
    } finally {
      await Promise.all([firstDatabase.close(), secondDatabase.close()]);
    }

    const rows = await database.db.select({
      session_id: schema.pushDevices.sessionId,
      token_hash: schema.pushDevices.tokenHash,
      token: schema.pushDevices.token,
      token_ciphertext: schema.pushDevices.tokenCiphertext,
    }).from(schema.pushDevices).where(and(
      eq(schema.pushDevices.userId, ids.alice),
      eq(schema.pushDevices.installationId, installationId),
    ));
    expect(rows).toHaveLength(1);
    expect([
      {
        session_id: firstDevice.sessionId,
        token_hash: firstDevice.tokenHash,
        token: firstDevice.tokenCiphertext,
        token_ciphertext: firstDevice.tokenCiphertext,
      },
      {
        session_id: secondDevice.sessionId,
        token_hash: secondDevice.tokenHash,
        token: secondDevice.tokenCiphertext,
        token_ciphertext: secondDevice.tokenCiphertext,
      },
    ]).toContainEqual(rows[0]);
  });

  it("rejects stale and banned sessions before they can rotate a token", async () => {
    const staleHash = tokenHash("b");
    await database.db.delete(schema.session).where(eq(schema.session.id, ids.aliceSession));
    await expect(store.register(device({
      id: `register-device-stale-${crypto.randomUUID()}`,
      userId: ids.alice,
      sessionId: ids.aliceSession,
      installationId: "stale-installation",
      tokenHash: staleHash,
    }))).rejects.toBeInstanceOf(PushSessionInactiveError);

    await database.db.update(schema.user)
      .set({ banned: true, banExpires: null })
      .where(eq(schema.user.id, ids.bob));
    await expect(store.register(device({
      id: `register-device-banned-${crypto.randomUUID()}`,
      userId: ids.bob,
      sessionId: ids.bobSession,
      installationId: "banned-installation",
      tokenHash: tokenHash("c"),
    }))).rejects.toBeInstanceOf(PushSessionInactiveError);

    const rows = await database.db.select({ token_hash: schema.pushDevices.tokenHash })
      .from(schema.pushDevices)
      .where(inArray(schema.pushDevices.tokenHash, [staleHash, tokenHash("c")]));
    expect(rows).toEqual([]);
  });
});

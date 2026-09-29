import { createDayliDatabase, sql } from "@dayli/db";
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
    bobSession: `register-device-bob-session-${crypto.randomUUID()}`,
  };
  const store = createPostgresRegisterDeviceStore(database.db);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
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
    const createdAt = new Date().toISOString();
    await database.client`insert into public."user" (id, name, email) values (${ids.alice}, ${ids.alice}, ${ids.alice + "@example.test"}), (${ids.bob}, ${ids.bob}, ${ids.bob + "@example.test"})`;
    await database.client`insert into public.session (id, expires_at, token, created_at, updated_at, user_id) values (${ids.aliceSession}, ${expiresAt}, ${`token-${ids.alice}`}, ${createdAt}, ${createdAt}, ${ids.alice}), (${ids.bobSession}, ${expiresAt}, ${`token-${ids.bob}`}, ${createdAt}, ${createdAt}, ${ids.bob})`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${[ids.alice, ids.bob]}::text[])`;
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

    const rows = [...await database.db.execute(sql`
      select user_id, installation_id, token, token_ciphertext, token_key_version
      from public.push_devices
      where token_hash = ${hash}
    `) as Iterable<Record<string, string>>];
    expect(rows).toEqual([{
      user_id: ids.bob,
      installation_id: "bob-installation",
      token: expect.stringContaining("ciphertext-register-device-bob-device-"),
      token_ciphertext: expect.stringContaining("ciphertext-register-device-bob-device-"),
      token_key_version: "test",
    }]);
  });

  it("rejects stale and banned sessions before they can rotate a token", async () => {
    const staleHash = tokenHash("b");
    await database.db.execute(sql`delete from public.session where id = ${ids.aliceSession}`);
    await expect(store.register(device({
      id: `register-device-stale-${crypto.randomUUID()}`,
      userId: ids.alice,
      sessionId: ids.aliceSession,
      installationId: "stale-installation",
      tokenHash: staleHash,
    }))).rejects.toBeInstanceOf(PushSessionInactiveError);

    await database.db.execute(sql`update public."user" set banned = true, ban_expires = null where id = ${ids.bob}`);
    await expect(store.register(device({
      id: `register-device-banned-${crypto.randomUUID()}`,
      userId: ids.bob,
      sessionId: ids.bobSession,
      installationId: "banned-installation",
      tokenHash: tokenHash("c"),
    }))).rejects.toBeInstanceOf(PushSessionInactiveError);

    const rows = [...await database.db.execute(sql`
      select token_hash from public.push_devices where token_hash in (${staleHash}, ${tokenHash("c")})
    `) as Iterable<unknown>];
    expect(rows).toEqual([]);
  });
});

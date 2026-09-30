import { createDayliDatabase } from "@dayli/db";
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
    const now = new Date().toISOString();
    await database.client`insert into public."user" (id, name, email) values (${ids.alice}, ${ids.alice}, ${ids.alice + "@example.test"}), (${ids.bob}, ${ids.bob}, ${ids.bob + "@example.test"})`;
    await database.client`insert into public.push_devices (id, user_id, session_id, installation_id, platform, token, token_hash, opted_in, registered_at) values (${`unregister-device-alice-device-${crypto.randomUUID()}`}, ${ids.alice}, ${"session-alice"}, ${"shared-installation"}, ${"ios"}, ${"ciphertext-alice"}, ${"a".repeat(64)}, true, ${now}), (${`unregister-device-bob-device-${crypto.randomUUID()}`}, ${ids.bob}, ${"session-bob"}, ${"shared-installation"}, ${"android"}, ${"ciphertext-bob"}, ${"b".repeat(64)}, true, ${now}), (${`unregister-device-bob-only-device-${crypto.randomUUID()}`}, ${ids.bob}, ${"session-bob"}, ${"bob-only-installation"}, ${"android"}, ${"ciphertext-bob-only"}, ${"c".repeat(64)}, true, ${now})`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${[ids.alice, ids.bob]}::text[])`;
    } finally {
      await database.close();
    }
  });

  it("deletes only the verified actor's installation", async () => {
    await repository.unregister(ids.alice, "shared-installation");

    const rows = await database.client`select user_id from public.push_devices where installation_id = ${"shared-installation"} order by user_id`;
    expect(rows).toEqual([{ user_id: ids.bob }]);
  });

  it("does not delete an installation owned by another actor", async () => {
    await repository.unregister(ids.alice, "bob-only-installation");

    const rows = await database.client`select user_id from public.push_devices where installation_id = ${"bob-only-installation"}`;
    expect(rows).toEqual([{ user_id: ids.bob }]);
  });

  it("is a no-op when the installation is missing", async () => {
    await expect(repository.unregister(ids.bob, "missing-installation")).resolves.toBeUndefined();

    const rows = await database.client`select user_id from public.push_devices where installation_id = ${"bob-only-installation"}`;
    expect(rows).toEqual([{ user_id: ids.bob }]);
  });
});

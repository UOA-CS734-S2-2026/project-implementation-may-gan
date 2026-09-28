import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDayliDatabase, sql } from "@dayli/db";
import { createPostgresPushDeviceStore } from "../../features/messaging/push/push-device.repository";
import { PushSessionInactiveError } from "../../features/messaging/push/push-device.service";
import { createPushOutboxHandler } from "./push-dispatcher";
import { createPostgresPushDestinationResolver } from "./push-destination.repository";

const connectionString = process.env.MESSAGING_DELIVERY_TEST_DATABASE_URL ?? process.env.MESSAGING_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;

suite("Postgres push destination authorization", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_delivery");
  const devices = createPostgresPushDeviceStore(database.db);
  const resolver = createPostgresPushDestinationResolver(database.db, {
    encrypt: async (token) => ({ ciphertext: token, keyVersion: "test" }),
    decrypt: async ({ ciphertext, keyVersion }) => keyVersion === "test" ? ciphertext : null,
  });
  const ids = {
    alice: `push-alice-${crypto.randomUUID()}`,
    bob: `push-bob-${crypto.randomUUID()}`,
    aliceSession: `push-alice-session-${crypto.randomUUID()}`,
    bobSession: `push-bob-session-${crypto.randomUUID()}`,
    conversation: `push-conversation-${crypto.randomUUID()}`,
    aliceDevice: `push-alice-device-${crypto.randomUUID()}`,
    bobDevice: `push-bob-device-${crypto.randomUUID()}`,
  };
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const tokenHash = (value: string) => value.repeat(64).slice(0, 64);

  function job(recipientId: string, deviceRegistrationId: string) {
    return {
      id: `push-job-${crypto.randomUUID()}`,
      eventId: `push-event-${crypto.randomUUID()}`,
      recipientId,
      conversationId: ids.conversation,
      changeSequence: "1",
      channel: "push" as const,
      deviceRegistrationId,
      attempts: 1,
      leaseToken: "lease",
      leaseExpiresAt: new Date(Date.now() + 30_000),
    };
  }

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) values (${ids.alice}, ${ids.alice}, ${ids.alice + "@example.test"}), (${ids.bob}, ${ids.bob}, ${ids.bob + "@example.test"})`;
    await database.client`insert into public.session (id, expires_at, token, created_at, updated_at, user_id) values (${ids.aliceSession}, ${expiresAt}, ${`token-${ids.alice}`}, ${now}, ${now}, ${ids.alice}), (${ids.bobSession}, ${expiresAt}, ${`token-${ids.bob}`}, ${now}, ${now}, ${ids.bob})`;
    await database.client`insert into public.conversations (id, kind, user_low_id, user_high_id, initiator_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${ids.conversation}, 'direct', ${ids.alice}, ${ids.bob}, ${ids.alice}, 'active', 0, 0, ${now}, ${now}, ${now})`;
    await database.client`insert into public.conversation_members (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${ids.conversation}, ${ids.alice}, 0, 0, ${now}, ${now}), (${ids.conversation}, ${ids.bob}, 0, 0, ${now}, ${now})`;
    await devices.register({ id: ids.aliceDevice, userId: ids.alice, sessionId: ids.aliceSession, installationId: "alice-installation", platform: "ios", tokenCiphertext: "alice-token", tokenKeyVersion: "test", tokenHash: tokenHash("a"), optedIn: true, now: new Date() });
    await devices.register({ id: ids.bobDevice, userId: ids.bob, sessionId: ids.bobSession, installationId: "bob-installation", platform: "android", tokenCiphertext: "bob-token", tokenKeyVersion: "test", tokenHash: tokenHash("b"), optedIn: true, now: new Date() });
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${[ids.alice, ids.bob]}::text[])`;
    } finally { await database.close(); }
  });

  it("rejects a delayed revoked-session registration and suppresses stale, banned, and deleted destinations", async () => {
    await database.db.execute(sql`delete from public.session where id = ${ids.aliceSession}`);

    await expect(devices.register({ id: `late-${crypto.randomUUID()}`, userId: ids.alice, sessionId: ids.aliceSession, installationId: "late-installation", platform: "ios", tokenCiphertext: "late-token", tokenKeyVersion: "test", tokenHash: tokenHash("c"), optedIn: true, now: new Date() })).rejects.toBeInstanceOf(PushSessionInactiveError);

    const sender = { send: vi.fn(async () => ({ ok: true as const })) };
    const deliver = createPushOutboxHandler({ destinations: resolver, sender });
    await expect(deliver(job(ids.alice, ids.aliceDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).not.toHaveBeenCalled();

    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ token: "bob-token" }), undefined);

    await database.db.execute(sql`update public."user" set banned = true, ban_expires = null where id = ${ids.bob}`);
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(1);

    await database.db.execute(sql`delete from public."user" where id = ${ids.alice}`);
    await expect(deliver(job(ids.alice, ids.aliceDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(1);
  });
});

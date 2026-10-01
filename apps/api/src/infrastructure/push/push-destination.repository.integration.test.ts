import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, eq, inArray } from "drizzle-orm";
import { createPostgresRegisterDeviceStore } from "../../features/messaging/push/register-device/register-device.repository";
import { PushSessionInactiveError } from "../../features/messaging/push/register-device/register-device.service";
import { createPushOutboxHandler } from "./push-dispatcher";
import { createPostgresPushDestinationResolver } from "./push-destination.repository";

const connectionString = process.env.MESSAGING_DELIVERY_TEST_DATABASE_URL ?? process.env.MESSAGING_TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : undefined;
if (target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("Push destination integration tests must use the isolated dayli_messaging_test database.");
}
const suite = connectionString ? describe : describe.skip;

suite("Postgres push destination authorization", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_delivery");
  const devices = createPostgresRegisterDeviceStore(database.db);
  const resolver = createPostgresPushDestinationResolver(database.db, {
    encrypt: async (token) => ({ ciphertext: token, keyVersion: "test" }),
    decrypt: async ({ ciphertext, keyVersion }) => keyVersion === "test" ? ciphertext : null,
  });
  const ids = {
    alice: `push-alice-${crypto.randomUUID()}`,
    bob: `push-bob-${crypto.randomUUID()}`,
    aliceParticipant: `a-push-participant-${crypto.randomUUID()}`,
    bobParticipant: `z-push-participant-${crypto.randomUUID()}`,
    aliceSession: `push-alice-session-${crypto.randomUUID()}`,
    bobSession: `push-bob-session-${crypto.randomUUID()}`,
    conversation: `push-conversation-${crypto.randomUUID()}`,
    aliceDevice: `push-alice-device-${crypto.randomUUID()}`,
    bobDevice: `push-bob-device-${crypto.randomUUID()}`,
  };
  const now = new Date();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
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
    await database.db.insert(schema.user).values([
      { id: ids.alice, name: ids.alice, email: `${ids.alice}@example.test` },
      { id: ids.bob, name: ids.bob, email: `${ids.bob}@example.test` },
    ]);
    await database.db.update(schema.messagingParticipants).set({ id: ids.aliceParticipant })
      .where(eq(schema.messagingParticipants.userId, ids.alice));
    await database.db.update(schema.messagingParticipants).set({ id: ids.bobParticipant })
      .where(eq(schema.messagingParticipants.userId, ids.bob));
    await database.db.insert(schema.session).values([
      { id: ids.aliceSession, expiresAt, token: `token-${ids.alice}`, createdAt: now, updatedAt: now, userId: ids.alice },
      { id: ids.bobSession, expiresAt, token: `token-${ids.bob}`, createdAt: now, updatedAt: now, userId: ids.bob },
    ]);
    await database.db.insert(schema.conversations).values({
      id: ids.conversation, kind: "direct", userLowId: ids.alice, userHighId: ids.bob, initiatorId: ids.alice,
      requestState: "active", lastMessageSequence: 0, lastChangeSequence: 0, lastActivityAt: now, createdAt: now, updatedAt: now,
    });
    await database.db.insert(schema.conversationMembers).values([
      { conversationId: ids.conversation, userId: ids.alice, lastReadSequence: 0, receiptSequence: 0, createdAt: now, updatedAt: now },
      { conversationId: ids.conversation, userId: ids.bob, lastReadSequence: 0, receiptSequence: 0, createdAt: now, updatedAt: now },
    ]);
    await devices.register({ id: ids.aliceDevice, userId: ids.alice, sessionId: ids.aliceSession, installationId: "alice-installation", platform: "ios", tokenCiphertext: "alice-token", tokenKeyVersion: "test", tokenHash: tokenHash("a"), optedIn: true, now: new Date() });
    await devices.register({ id: ids.bobDevice, userId: ids.bob, sessionId: ids.bobSession, installationId: "bob-installation", platform: "android", tokenCiphertext: "bob-token", tokenKeyVersion: "test", tokenHash: tokenHash("b"), optedIn: true, now: new Date() });
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.user).where(inArray(schema.user.id, [ids.alice, ids.bob]));
    } finally { await database.close(); }
  });

  it("rejects a delayed revoked-session registration and suppresses banned, nonmember, blocked, invalidated, and deleted destinations", async () => {
    const sender = { send: vi.fn(async () => ({ ok: true as const })) };
    const deliver = createPushOutboxHandler({ destinations: resolver, sender });

    await database.db.update(schema.user).set({ banned: false, banExpires: null }).where(eq(schema.user.id, ids.bob));
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ token: "bob-token" }), undefined);

    await database.db.update(schema.user).set({ banned: null }).where(eq(schema.user.id, ids.bob));
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(2);

    await database.db.update(schema.user).set({ banned: true, banExpires: sql`now() - interval '5 minutes'` }).where(eq(schema.user.id, ids.bob));
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);

    await database.db.update(schema.user).set({ banned: true, banExpires: sql`now() + interval '5 minutes'` }).where(eq(schema.user.id, ids.bob));
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);

    await database.db.update(schema.user).set({ banned: true, banExpires: null }).where(eq(schema.user.id, ids.bob));
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);
    await database.db.update(schema.user).set({ banned: false, banExpires: null }).where(eq(schema.user.id, ids.bob));

    await database.db.delete(schema.conversationMembers).where(and(
      eq(schema.conversationMembers.conversationId, ids.conversation),
      eq(schema.conversationMembers.userId, ids.bob),
    ));
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);
    await database.db.insert(schema.conversationMembers).values({
      conversationId: ids.conversation, userId: ids.bob, lastReadSequence: 0, receiptSequence: 0, createdAt: now, updatedAt: now,
    });

    await database.db.insert(schema.relationshipBlocks).values({ blockerId: ids.alice, blockedId: ids.bob, blockedAt: now });
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);
    await database.db.delete(schema.relationshipBlocks).where(and(
      eq(schema.relationshipBlocks.blockerId, ids.alice),
      eq(schema.relationshipBlocks.blockedId, ids.bob),
    ));

    await database.db.insert(schema.relationshipBlocks).values({ blockerId: ids.bob, blockedId: ids.alice, blockedAt: now });
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);
    await database.db.delete(schema.relationshipBlocks).where(and(
      eq(schema.relationshipBlocks.blockerId, ids.bob),
      eq(schema.relationshipBlocks.blockedId, ids.alice),
    ));

    const requestedAt = new Date();
    await database.db.insert(schema.accountLifecycles).values({
      userId: ids.alice, state: "pending_deletion", requestId: crypto.randomUUID(),
      idempotencyKeyDigest: "f".repeat(64), generation: 1, requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    });
    await expect(resolver.resolve(job(ids.bob, ids.bobDevice))).resolves.toBeNull();
    await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, ids.alice));

    await resolver.invalidate(ids.bobDevice);
    await expect(resolver.resolve(job(ids.bob, ids.bobDevice))).resolves.toBeNull();
    await expect(deliver(job(ids.bob, ids.bobDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);

    await database.db.delete(schema.session).where(eq(schema.session.id, ids.aliceSession));
    await expect(devices.register({ id: `late-${crypto.randomUUID()}`, userId: ids.alice, sessionId: ids.aliceSession, installationId: "late-installation", platform: "ios", tokenCiphertext: "late-token", tokenKeyVersion: "test", tokenHash: tokenHash("c"), optedIn: true, now: new Date() })).rejects.toBeInstanceOf(PushSessionInactiveError);
    await expect(deliver(job(ids.alice, ids.aliceDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);

    await database.db.delete(schema.user).where(eq(schema.user.id, ids.alice));
    await expect(deliver(job(ids.alice, ids.aliceDevice))).resolves.toEqual({ ok: true });
    expect(sender.send).toHaveBeenCalledTimes(3);
  });
});

import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresRelationshipsStore } from "../../../features/relationships/shared/relationships.repository";
import { createRelationshipsService } from "../../../app";
import { publishNotificationIntent } from "../publish-notification";
import { dailyNotificationWindow, publishDailyNotifications } from "../daily-notification-scheduler";
import { createPostgresNotificationResolver } from "../notification-resolver";
import type { NotificationJob } from "../notification-store";

const connectionString = process.env.RELATIONSHIP_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Notification publisher integration requires the disposable relationship fixture.");
const target = new URL(connectionString);
if (target.hostname === "localhost" && target.port === "5433" && target.pathname === "/dayli_test") throw new Error("Shared database is not permitted.");

const database = createDayliDatabase(connectionString);
const other = createDayliDatabase(connectionString);
const users = Array.from({ length: 30 }, () => `notify-publisher-${crypto.randomUUID()}`);
const service = createRelationshipsService(createPostgresRelationshipsStore(database.db, { notificationPublishersEnabled: true }));
let promptId: string;
const night = new Date("2099-01-01T10:15:00.000Z");
const window = dailyNotificationWindow(night);
const protector = { encrypt: async () => ({ ciphertext: "fake-cipher", keyVersion: "v1" }), decrypt: async () => "fake-token" };

async function device(index: number, version: number | null = 1) {
  const userId = users[index]!;
  const sessionId = crypto.randomUUID();
  const id = crypto.randomUUID();
  await database.db.insert(schema.session).values({ id: sessionId, userId, token: crypto.randomUUID(), expiresAt: new Date("2101-01-01T00:00:00Z"), createdAt: new Date(), updatedAt: new Date() });
  await database.db.insert(schema.accountNotificationPreferences).values({ userId, enabled: true }).onConflictDoUpdate({ target: schema.accountNotificationPreferences.userId, set: { enabled: true } });
  await database.db.insert(schema.pushDevices).values({ id, userId, sessionId, installationId: crypto.randomUUID(), platform: "android", token: `fake-${id}`, tokenCiphertext: `fake-cipher-${id}`, tokenKeyVersion: "v1", tokenHash: crypto.randomUUID().replaceAll("-", "").repeat(2), optedIn: true, notificationSchemaVersion: version, registeredAt: new Date() });
  return id;
}

async function jobs(userId: string, kind?: "friend_request" | "final_hour_reminder" | "friends_post_release") {
  const rows = await database.db.select({ delivery: schema.notificationDeliveries }).from(schema.notificationDeliveries)
    .innerJoin(schema.notificationEvents, eq(schema.notificationEvents.id, schema.notificationDeliveries.eventId))
    .where(and(eq(schema.notificationDeliveries.recipientId, userId), kind ? eq(schema.notificationEvents.kind, kind) : undefined));
  return rows.map(({ delivery }): NotificationJob => ({ ...delivery, leaseToken: "test-lease", leaseExpiresAt: new Date("2101-01-01T00:00:00Z") }));
}

async function post(index: number, date: string, audience: "solo" | "friends", releasedAt: Date) {
  const id = crypto.randomUUID();
  await database.db.insert(schema.posts).values({ id, authorId: users[index]!, localDate: date, promptId, reflectiveAnswer: "Private post must not enter notification copy", rating: 5, audience, acceptedAt: new Date(releasedAt.getTime() - 3_600_000), releasedAt });
  return id;
}

beforeAll(async () => {
  await database.db.insert(schema.user).values(users.map((id, index) => ({ id, name: "Private signup name", username: `notify${index}${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`, displayUsername: `Public sender ${index}`, email: `${id}@example.test` })));
  const [prompt] = await database.db.select({ id: schema.dailyPrompts.id }).from(schema.dailyPrompts).limit(1);
  expect(prompt).toBeDefined();
  promptId = prompt!.id;
});

afterAll(async () => {
  try {
    await database.db.delete(schema.friendRequests).where(or(inArray(schema.friendRequests.senderId, users), inArray(schema.friendRequests.recipientId, users)));
    await database.db.delete(schema.friendships).where(or(inArray(schema.friendships.userId, users), inArray(schema.friendships.friendId, users)));
    await database.db.delete(schema.relationshipBlocks).where(or(inArray(schema.relationshipBlocks.blockerId, users), inArray(schema.relationshipBlocks.blockedId, users)));
    await database.db.delete(schema.posts).where(inArray(schema.posts.authorId, users));
    await database.db.delete(schema.user).where(inArray(schema.user.id, users));
  } finally { await other.close(); await database.close(); }
});

describe("transactional friend request notifications", () => {
  it("records only recipient capable-device work, without a private signup name", async () => {
    await device(0); await device(1); await device(1, null);
    const result = await service.sendRequest(users[0]!, users[1]!);
    expect(await jobs(users[0]!)).toHaveLength(0);
    const work = await jobs(users[1]!);
    expect(work).toHaveLength(1);
    const resolver = createPostgresNotificationResolver(database.db, protector);
    expect(await resolver.resolve(work[0]!)).toMatchObject({ title: "Public sender 0", body: "Sent you a friend request on Dayli", targetId: result.outgoingRequest!.id, type: "friend_request" });
    await expect(service.sendRequest(users[0]!, users[1]!)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await jobs(users[1]!)).toHaveLength(1);
    await service.cancelRequest(users[0]!, result.outgoingRequest!.id);
    expect(await resolver.resolve(work[0]!)).toBeNull();
  });
  it("rolls back both request and intent on transaction failure", async () => {
    await device(3);
    const store = createPostgresRelationshipsStore(database.db, { notificationPublishersEnabled: true });
    await expect(store.withTransaction(async (transaction) => {
      await transaction.sendRequest({ senderId: users[2]!, recipientId: users[3]!, createdAt: new Date().toISOString() });
      throw new Error("rollback fixture");
    })).rejects.toThrow("rollback fixture");
    expect(await jobs(users[3]!)).toHaveLength(0);
    const [count] = await database.db.select({ n: sql<number>`count(*)::int` }).from(schema.friendRequests).where(eq(schema.friendRequests.recipientId, users[3]!));
    expect(count!.n).toBe(0);
  });
  it.each(["accepted", "declined", "cancelled"] as const)("suppresses a %s request", async (status) => {
    const index = status === "accepted" ? 4 : status === "declined" ? 6 : 8;
    await device(index + 1);
    const result = await service.sendRequest(users[index]!, users[index + 1]!);
    const [job] = await jobs(users[index + 1]!);
    await database.db.update(schema.friendRequests).set({ status, resolvedAt: new Date() }).where(eq(schema.friendRequests.id, result.outgoingRequest!.id));
    expect(await createPostgresNotificationResolver(database.db, protector).resolve(job!)).toBeNull();
  });
  it("suppresses blocks and does not invalidate a replacement token", async () => {
    const registration = await device(11);
    await service.sendRequest(users[10]!, users[11]!);
    const [job] = await jobs(users[11]!);
    const resolver = createPostgresNotificationResolver(database.db, protector);
    const resolved = await resolver.resolve(job!);
    expect(resolved).not.toBeNull();
    await database.db.update(schema.pushDevices).set({ tokenHash: crypto.randomUUID().replaceAll("-", "").repeat(2), tokenCiphertext: "replacement" }).where(eq(schema.pushDevices.id, registration));
    await resolver.invalidate(job!, resolved!.registrationGeneration);
    const [current] = await database.db.select().from(schema.pushDevices).where(eq(schema.pushDevices.id, registration));
    expect(current!.invalidatedAt).toBeNull();
    await service.block(users[11]!, users[10]!);
    expect(await resolver.resolve(job!)).toBeNull();
  });
  it("keeps the publisher disabled by default", async () => {
    await device(13);
    await createRelationshipsService(createPostgresRelationshipsStore(database.db)).sendRequest(users[12]!, users[13]!);
    expect(await jobs(users[13]!)).toHaveLength(0);
  });
});

describe("durable daily publication and fresh eligibility", () => {
  it("progresses through recipient batches and deduplicates concurrent/restarted runs", async () => {
    await device(14); await device(15); await device(16);
    const noReminder = new Date(window.startUtc.getTime() + 1);
    await publishDailyNotifications(database.db, { now: noReminder, batchSize: 1 });
    expect(await jobs(users[14]!, "final_hour_reminder")).toHaveLength(0);
    for (let n = 0; n < 20; n++) await publishDailyNotifications(database.db, { now: night, batchSize: 1 });
    await Promise.all([publishDailyNotifications(database.db, { now: night }), publishDailyNotifications(other.db, { now: night })]);
    for (const index of [14, 15, 16]) expect(await jobs(users[index]!, "final_hour_reminder")).toHaveLength(1);
    const [job] = await jobs(users[14]!, "final_hour_reminder");
    const resolver = createPostgresNotificationResolver(database.db, protector, () => night);
    expect(await resolver.resolve(job!)).toMatchObject({ title: "Dayli", type: "final_hour_reminder" });
    await post(14, window.localDate, "solo", window.nextMidnightUtc);
    expect(await resolver.resolve(job!)).toBeNull();
    expect(await createPostgresNotificationResolver(database.db, protector, () => window.nextMidnightUtc).resolve(job!)).toBeNull();
  });
  it("requires a currently readable preceding-day friends post and rechecks friendship", async () => {
    await device(18);
    const releasedPost = await post(17, window.previousDate, "friends", window.startUtc);
    const at = window.startUtc;
    await database.db.insert(schema.friendships).values([{ userId: users[17]!, friendId: users[18]!, state: "active", stateChangedAt: at }, { userId: users[18]!, friendId: users[17]!, state: "active", stateChangedAt: at }]);
    await publishDailyNotifications(database.db, { now: night });
    const [job] = await jobs(users[18]!, "friends_post_release");
    expect(job).toBeDefined();
    const resolver = createPostgresNotificationResolver(database.db, protector, () => night);
    const result = await resolver.resolve(job!);
    expect(result).toMatchObject({ title: "Dayli", body: "Your friends' posts are ready.", targetId: window.localDate });
    expect(JSON.stringify(result)).not.toContain("Private post");
    const pair = or(
      and(eq(schema.friendships.userId, users[18]!), eq(schema.friendships.friendId, users[17]!)),
      and(eq(schema.friendships.userId, users[17]!), eq(schema.friendships.friendId, users[18]!)),
    );
    await database.db.update(schema.friendships).set({ state: "ended" }).where(pair);
    expect(await resolver.resolve(job!)).toBeNull();
    await database.db.update(schema.friendships).set({ state: "active" }).where(pair);
    const trashedAt = new Date();
    await database.db.update(schema.posts).set({ trashedAt, restoreUntil: new Date(trashedAt.getTime() + 168 * 3_600_000), trashPurgeDueAt: new Date(trashedAt.getTime() + 336 * 3_600_000) }).where(eq(schema.posts.id, releasedPost));
    expect(await resolver.resolve(job!)).toBeNull();
  });
  it("does not generate daily work for denied devices, opt-out, solo or empty feeds", async () => {
    await device(20, null); await device(21);
    await database.db.update(schema.accountNotificationPreferences).set({ enabled: false }).where(eq(schema.accountNotificationPreferences.userId, users[21]!));
    await post(19, window.previousDate, "solo", window.startUtc);
    await publishDailyNotifications(database.db, { now: night });
    expect(await jobs(users[20]!)).toHaveLength(0);
    expect(await jobs(users[21]!)).toHaveLength(0);
    expect(await jobs(users[19]!, "friends_post_release")).toHaveLength(0);
  });
  it("logical-event uniqueness remains transactional under duplicate inserts", async () => {
    await device(23);
    const source = { kind: "final_hour_reminder" as const, sourceId: window.localDate, recipientId: users[23]!, createdAt: night, expiresAt: window.nextMidnightUtc };
    await Promise.all([database.db.transaction((tx) => publishNotificationIntent(tx, source)), other.db.transaction((tx) => publishNotificationIntent(tx, source))]);
    expect(await jobs(users[23]!)).toHaveLength(1);
  });
});

import { createDayliDatabase, schema } from "@dayli/db";
import { inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresGetMessagingUnreadRepository } from "../get-messaging-unread.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("get messaging unread Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 6 }, (_, index) => `get-messaging-unread-${crypto.randomUUID()}-${index}`);
  const { direct, send } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresGetMessagingUnreadRepository(database.db);

  beforeAll(async () => {
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: new Date() },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
      { userId: users[4]!, friendId: users[5]!, state: "active", stateChangedAt: new Date() },
      { userId: users[5]!, friendId: users[4]!, state: "active", stateChangedAt: new Date() },
    ]);
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.relationshipBlocks).where(or(
        inArray(schema.relationshipBlocks.blockerId, users),
        inArray(schema.relationshipBlocks.blockedId, users),
      ));
      await database.db.delete(schema.friendships).where(or(
        inArray(schema.friendships.userId, users),
        inArray(schema.friendships.friendId, users),
      ));
      await database.db.delete(schema.friendRequests).where(or(
        inArray(schema.friendRequests.senderId, users),
        inArray(schema.friendRequests.recipientId, users),
      ));
      await database.db.delete(schema.user).where(inArray(schema.user.id, users));
    } finally {
      await database.close();
    }
  });

  it("keeps actor-scoped inbox and incoming-request counts, including message-count duplicates", async () => {
    const active = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "active initial message",
    });
    await send.send(users[1]!, active.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "first unread active message",
    });
    await send.send(users[1]!, active.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "second unread active message",
    });
    await direct.create(users[2]!, {
      recipientId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      text: "incoming request",
    });
    await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "outgoing request",
    });

    const isolated = await direct.create(users[4]!, {
      recipientId: users[5]!,
      clientMessageId: crypto.randomUUID(),
      text: "isolated active initial message",
    });
    await send.send(users[5]!, isolated.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "isolated unread active message",
    });

    await expect(repository.get(users[0]!)).resolves.toEqual({ inboxCount: 2, requestCount: 1 });
    await expect(repository.get(users[2]!)).resolves.toEqual({ inboxCount: 0, requestCount: 0 });
    await expect(repository.get(users[4]!)).resolves.toEqual({ inboxCount: 1, requestCount: 0 });
  });
});

import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresGetDirectConversationRepository } from "../get-direct-conversation.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : undefined;
if (target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = connectionString ? describe : describe.skip;

suite("actor-owned direct pair lookup Postgres persistence", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const mixedCasePrefix = `direct-pair-${crypto.randomUUID()}-`;
  const mixedCaseUsers = [`${mixedCasePrefix}a`, `${mixedCasePrefix}B`] as const;
  const users = [
    ...Array.from({ length: 8 }, (_, index) => `direct-pair-${crypto.randomUUID()}-${index}`),
    ...mixedCaseUsers,
  ];
  const builderQueries: string[] = [];
  const observedDatabase = drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  });
  const { direct, resolveMessageRequest } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresGetDirectConversationRepository(database.db);
  const observedRepository = createPostgresGetDirectConversationRepository(observedDatabase);

  beforeAll(async () => {
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
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

  it("finds active, outgoing, incoming and declined threads, but not unrelated or blocked pairs", async () => {
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: new Date() },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: new Date() },
    ]);
    const active = await direct.create(users[0]!, { recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "active" });
    const pending = await direct.create(users[2]!, { recipientId: users[3]!, clientMessageId: crypto.randomUUID(), text: "pending" });
    const declined = await direct.create(users[4]!, { recipientId: users[5]!, clientMessageId: crypto.randomUUID(), text: "declined" });
    await resolveMessageRequest.resolve(users[5]!, declined.conversation.id, "decline");

    await expect(repository.find(users[0]!, users[1]!)).resolves.toEqual({ conversationId: active.conversation.id });
    await expect(repository.find(users[2]!, users[3]!)).resolves.toEqual({ conversationId: pending.conversation.id });
    await expect(repository.find(users[3]!, users[2]!)).resolves.toEqual({ conversationId: pending.conversation.id });
    await expect(repository.find(users[4]!, users[5]!)).resolves.toEqual({ conversationId: declined.conversation.id });
    await expect(repository.find(users[6]!, users[3]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.find(users[6]!, users[7]!)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users[1]!,
      blockedId: users[0]!,
      blockedAt: new Date(),
    });
    await expect(repository.find(users[0]!, users[1]!)).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(repository.find(users[1]!, users[0]!)).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("finds a mixed-case pair in reverse request order with PostgreSQL ordering", async () => {
    const [actorId, recipientId] = mixedCaseUsers;
    const created = await direct.create(actorId, { recipientId, clientMessageId: crypto.randomUUID(), text: "mixed case" });
    builderQueries.length = 0;

    await expect(observedRepository.find(recipientId, actorId)).resolves.toEqual({ conversationId: created.conversation.id });

    const queries = builderQueries.map((query) => query.toLowerCase());
    expect(queries.some((query) => (
      query.startsWith("select") && query.includes("least(") && query.includes("greatest(")
    ))).toBe(true);
  });

  it("requires an actor-owned membership while retaining counterpart-order lookup", async () => {
    const created = await direct.create(users[6]!, { recipientId: users[7]!, clientMessageId: crypto.randomUUID(), text: "membership" });
    await database.db.delete(schema.conversationMembers).where(and(
      eq(schema.conversationMembers.conversationId, created.conversation.id),
      eq(schema.conversationMembers.userId, users[6]!),
    ));

    await expect(repository.find(users[6]!, users[7]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.find(users[7]!, users[6]!)).resolves.toEqual({ conversationId: created.conversation.id });
  });
});

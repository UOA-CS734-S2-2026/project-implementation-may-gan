import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresEditMessageStore } from "../edit-message.repository";
import { createEditMessageService } from "../edit-message.service";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("edit message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 2 }, (_, index) => `edit-message-${crypto.randomUUID()}-${index}`);
  let now = new Date("2026-09-29T10:00:00.000Z");
  const { direct } = createMessagingPersistenceServices(database.db, { now: () => now });
  const edit = createEditMessageService({ store: createPostgresEditMessageStore(database.db), now: () => now });

  beforeAll(async () => {
    const createdAt = new Date();
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: createdAt },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: createdAt },
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

  it("enforces edit policy and atomically persists edits, changes, and realtime outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "original",
    });

    await expect(edit.edit(users[1]!, created.conversation.id, created.message.id, {
      text: "not mine",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(edit.edit(users[0]!, created.conversation.id, created.message.id, {
      text: "edited",
      expectedVersion: 1,
    })).resolves.toMatchObject({ text: "edited", version: 2 });
    await expect(edit.edit(users[0]!, created.conversation.id, created.message.id, {
      text: "stale",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const [changes] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, created.conversation.id), eq(schema.conversationChanges.kind, "message.edited")));
    const [outbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, created.conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(4);

    const expiring = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "expiring",
    });
    now = new Date(new Date(expiring.message.createdAt).getTime() + 15 * 60_000);
    await expect(edit.edit(users[0]!, expiring.conversation.id, expiring.message.id, {
      text: "late",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "EDIT_WINDOW_EXPIRED" });

    now = new Date("2026-09-29T11:00:00.000Z");
    const unsent = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "unsent",
    });
    await database.db.update(schema.messages)
      .set({ body: null, unsentAt: new Date() })
      .where(eq(schema.messages.id, unsent.message.id));
    await expect(edit.edit(users[0]!, unsent.conversation.id, unsent.message.id, {
      text: "cannot edit",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const blocked = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked",
    });
    await database.db.insert(schema.relationshipBlocks).values({
      blockerId: users[1]!,
      blockedId: users[0]!,
      blockedAt: new Date(),
    });
    await expect(edit.edit(users[0]!, blocked.conversation.id, blocked.message.id, {
      text: "cannot edit",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "BLOCKED" });
  });
});

import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("set reaction Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 3 }, (_, index) => `set-reaction-${crypto.randomUUID()}-${index}`);
  const { direct, set: setReaction } = createMessagingPersistenceServices(database.db);

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now())`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public.relationship_blocks where blocker_id = any(${users}::text[]) or blocked_id = any(${users}::text[])`;
      await database.client`delete from public.friendships where user_id = any(${users}::text[]) or friend_id = any(${users}::text[])`;
      await database.client`delete from public.friend_requests where sender_id = any(${users}::text[]) or recipient_id = any(${users}::text[])`;
      await database.client`delete from public."user" where id = any(${users}::text[])`;
    } finally {
      await database.close();
    }
  });

  it("authorizes reactions, leaves same reactions unchanged, and persists changes with realtime outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "react to this",
    });
    const { conversation } = created;
    const { message } = created;

    await expect(setReaction.set(users[2]!, conversation.id, message.id, "love")).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "love")).resolves.toMatchObject({
      changed: true,
      message: { reactions: [{ reaction: "love", count: 1, reactedByActor: true }] },
    });
    const [initialChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversation.id} and kind = 'reaction.changed'`;
    const [initialOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversation.id} and channel = 'realtime'`;
    expect(initialChanges?.count).toBe(1);
    expect(initialOutbox?.count).toBe(4);

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "love")).resolves.toMatchObject({ changed: false });
    const [unchangedChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversation.id} and kind = 'reaction.changed'`;
    const [unchangedOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversation.id} and channel = 'realtime'`;
    expect(unchangedChanges?.count).toBe(1);
    expect(unchangedOutbox?.count).toBe(4);

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "laugh")).resolves.toMatchObject({
      changed: true,
      message: { reactions: [{ reaction: "laugh", count: 1, reactedByActor: true }] },
    });
    const [changedChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversation.id} and kind = 'reaction.changed'`;
    const [changedOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversation.id} and channel = 'realtime'`;
    expect(changedChanges?.count).toBe(2);
    expect(changedOutbox?.count).toBe(6);
  });
});

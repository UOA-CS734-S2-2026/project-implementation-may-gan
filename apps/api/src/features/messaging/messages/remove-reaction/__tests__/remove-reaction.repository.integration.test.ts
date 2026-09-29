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

suite("remove reaction Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `remove-reaction-${crypto.randomUUID()}-${index}`);
  const { direct, set: setReaction, remove: removeReaction } = createMessagingPersistenceServices(database.db);

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now()), (${users[0]!}, ${users[3]!}, 'active', now()), (${users[3]!}, ${users[0]!}, 'active', now())`;
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

  it("authorizes removal, preserves other actors' reactions, and writes outbox work only for changes", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "remove this reaction",
    });
    const { conversation, message } = created;

    await expect(removeReaction.remove(users[2]!, conversation.id, message.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await setReaction.set(users[0]!, conversation.id, message.id, "like");
    await setReaction.set(users[1]!, conversation.id, message.id, "love");

    await expect(removeReaction.remove(users[1]!, conversation.id, message.id)).resolves.toMatchObject({
      changed: true,
      message: { reactions: [{ reaction: "like", count: 1, reactedByActor: false }] },
    });
    const [changedReactions] = await database.client`select reaction, user_id from public.message_reactions where message_id = ${message.id}`;
    const [changedChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversation.id} and kind = 'reaction.changed'`;
    const [changedOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversation.id} and channel = 'realtime'`;
    expect(changedReactions).toMatchObject({ reaction: "like", user_id: users[0] });
    expect(changedChanges?.count).toBe(3);
    expect(changedOutbox?.count).toBe(8);

    await expect(removeReaction.remove(users[1]!, conversation.id, message.id)).resolves.toMatchObject({ changed: false });
    const [unchangedChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversation.id} and kind = 'reaction.changed'`;
    const [unchangedOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversation.id} and channel = 'realtime'`;
    expect(unchangedChanges?.count).toBe(3);
    expect(unchangedOutbox?.count).toBe(8);
  });

  it("rejects removal for blocked peers and unsent messages without deleting reactions", async () => {
    const blocked = await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked reaction",
    });
    await setReaction.set(users[3]!, blocked.conversation.id, blocked.message.id, "sad");
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[0]!}, ${users[3]!}, now())`;

    await expect(removeReaction.remove(users[3]!, blocked.conversation.id, blocked.message.id)).rejects.toMatchObject({ code: "BLOCKED" });
    const [blockedReaction] = await database.client`select count(*)::int as count from public.message_reactions where message_id = ${blocked.message.id} and user_id = ${users[3]!}`;
    expect(blockedReaction?.count).toBe(1);

    const unsent = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "unsent reaction",
    });
    await setReaction.set(users[1]!, unsent.conversation.id, unsent.message.id, "thanks");
    await database.client`update public.messages set body = null, unsent_at = now() where id = ${unsent.message.id}`;

    await expect(removeReaction.remove(users[1]!, unsent.conversation.id, unsent.message.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const [unsentReaction] = await database.client`select count(*)::int as count from public.message_reactions where message_id = ${unsent.message.id} and user_id = ${users[1]!}`;
    expect(unsentReaction?.count).toBe(1);
  });
});

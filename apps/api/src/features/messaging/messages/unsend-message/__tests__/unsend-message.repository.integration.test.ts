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

suite("unsend message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `unsend-message-${crypto.randomUUID()}-${index}`);
  const { direct, set: setReaction, unsend } = createMessagingPersistenceServices(database.db);

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

  it("tombstones and clears reactions once, then replays without extra changes or outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "unsend me",
    });
    await setReaction.set(users[1]!, created.conversation.id, created.message.id, "love");

    await expect(unsend.unsend(users[1]!, created.conversation.id, created.message.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [preservedReaction] = await database.client`select count(*)::int as count from public.message_reactions where message_id = ${created.message.id}`;
    expect(preservedReaction?.count).toBe(1);

    await expect(unsend.unsend(users[0]!, created.conversation.id, created.message.id)).resolves.toMatchObject({
      replayed: false,
      message: { text: null, reactions: [] },
    });
    const [tombstone] = await database.client`select body, unsent_at from public.messages where id = ${created.message.id}`;
    const [reactions] = await database.client`select count(*)::int as count from public.message_reactions where message_id = ${created.message.id}`;
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id} and kind = 'message.unsent'`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id} and channel = 'realtime'`;
    expect(tombstone?.body).toBeNull();
    expect(tombstone?.unsent_at).not.toBeNull();
    expect(reactions?.count).toBe(0);
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(6);

    await expect(unsend.unsend(users[0]!, created.conversation.id, created.message.id)).resolves.toMatchObject({ replayed: true });
    const [replayedChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id} and kind = 'message.unsent'`;
    const [replayedOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id} and channel = 'realtime'`;
    expect(replayedChanges?.count).toBe(1);
    expect(replayedOutbox?.count).toBe(6);
  });

  it("allows a pending initiator but rejects a blocked sender without a mutation", async () => {
    const pending = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "pending request",
    });
    await expect(unsend.unsend(users[0]!, pending.conversation.id, pending.message.id)).resolves.toMatchObject({ replayed: false, message: { text: null } });

    const blocked = await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked message",
    });
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[3]!}, ${users[0]!}, now())`;
    await expect(unsend.unsend(users[0]!, blocked.conversation.id, blocked.message.id)).rejects.toMatchObject({ code: "BLOCKED" });
    const [message] = await database.client`select body, unsent_at from public.messages where id = ${blocked.message.id}`;
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${blocked.conversation.id} and kind = 'message.unsent'`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${blocked.conversation.id} and channel = 'realtime'`;
    expect(message).toMatchObject({ body: "blocked message", unsent_at: null });
    expect(changes?.count).toBe(0);
    expect(outbox?.count).toBe(2);
  });
});

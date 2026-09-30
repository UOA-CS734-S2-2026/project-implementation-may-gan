import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresGetMessageRepository } from "../get-message.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("get message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `get-message-${crypto.randomUUID()}-${index}`);
  const { direct, send, unsend } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresGetMessageRepository(database.db);

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now())`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public.relationship_blocks where blocker_id = any(${users}::text[]) or blocked_id = any(${users}::text[])`;
      await database.client`delete from public.friendships where user_id = any(${users}::text[]) or friend_id = any(${users}::text[])`;
      await database.client`delete from public.friend_requests where sender_id = any(${users}::text[]) or recipient_id = any(${users}::text[])`;
      await database.client`delete from public.user where id = any(${users}::text[])`;
    } finally {
      await database.close();
    }
  });

  it("keeps private NOT_FOUND behavior and projects replies and actor reactions", async () => {
    const initial = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "parent message",
    });
    const reply = await send.send(users[1]!, initial.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "reply message",
      replyToMessageId: initial.message.id,
    });
    await database.client`insert into public.conversation_members (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${initial.conversation.id}, ${users[2]!}, 0, 0, now(), now())`;
    await database.client`insert into public.message_reactions (message_id, user_id, reaction, created_at) values (${reply.message.id}, ${users[0]!}, 'love', now()), (${reply.message.id}, ${users[1]!}, 'love', now()), (${reply.message.id}, ${users[2]!}, 'laugh', now())`;
    await database.client`update public.messages set sequence = 9007199254740993 where id = ${reply.message.id}`;

    await expect(repository.get(users[3]!, initial.conversation.id, reply.message.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.get(users[0]!, initial.conversation.id, crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });

    const messageForSender = await repository.get(users[0]!, initial.conversation.id, reply.message.id);
    expect(messageForSender).toMatchObject({
      id: reply.message.id,
      sequence: "9007199254740993",
      replyToMessageId: initial.message.id,
      replyPreview: { id: initial.message.id, senderId: users[0], text: "parent message", unsentAt: null },
    });
    const reactionsForSender = messageForSender.reactions;
    expect(reactionsForSender).toHaveLength(2);
    expect(reactionsForSender).toEqual(expect.arrayContaining([
      { reaction: "love", count: 2, reactedByActor: true },
      { reaction: "laugh", count: 1, reactedByActor: false },
    ]));
    await expect(repository.get(users[0]!, initial.conversation.id, reply.message.id)).resolves.toMatchObject({
      reactions: reactionsForSender,
    });

    const messageForThirdMember = await repository.get(users[2]!, initial.conversation.id, reply.message.id);
    expect(messageForThirdMember.reactions.map(({ reaction }) => reaction)).toEqual(reactionsForSender.map(({ reaction }) => reaction));
    expect(messageForThirdMember.reactions).toEqual(expect.arrayContaining([
      { reaction: "love", count: 2, reactedByActor: false },
      { reaction: "laugh", count: 1, reactedByActor: true },
    ]));

    await unsend.unsend(users[0]!, initial.conversation.id, initial.message.id);
    await expect(repository.get(users[1]!, initial.conversation.id, reply.message.id)).resolves.toMatchObject({
      text: "reply message",
      replyPreview: { id: initial.message.id, senderId: users[0], text: null, unsentAt: expect.any(String) },
      reactions: reactionsForSender,
    });

    await unsend.unsend(users[1]!, initial.conversation.id, reply.message.id);
    await expect(repository.get(users[0]!, initial.conversation.id, reply.message.id)).resolves.toMatchObject({
      text: null,
      replyPreview: { id: initial.message.id, senderId: users[0], text: null, unsentAt: expect.any(String) },
      reactions: [],
    });
    await expect(repository.get(users[3]!, initial.conversation.id, reply.message.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

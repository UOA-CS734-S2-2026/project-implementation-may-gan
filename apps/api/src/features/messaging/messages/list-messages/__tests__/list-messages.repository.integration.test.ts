import { createDayliDatabase, schema } from "@dayli/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresListMessagesRepository } from "../list-messages.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("list messages Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `list-messages-${crypto.randomUUID()}-${index}`);
  const { direct, send, unsend } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresListMessagesRepository(database.db);
  const builderQueries: string[] = [];
  const observedRepository = createPostgresListMessagesRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

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

  it("authorizes history pagination, keeps ordering, projects replies and reactions, and hides private conversations", async () => {
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
    await send.send(users[0]!, initial.conversation.id, { clientMessageId: crypto.randomUUID(), text: "third message" });
    const fourth = await send.send(users[1]!, initial.conversation.id, { clientMessageId: crypto.randomUUID(), text: "fourth message" });
    await database.client`insert into public.conversation_members (conversation_id, user_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${initial.conversation.id}, ${users[2]!}, 0, 0, now(), now())`;
    await database.client`insert into public.message_reactions (message_id, user_id, reaction, created_at) values (${reply.message.id}, ${users[0]!}, 'love', now()), (${reply.message.id}, ${users[1]!}, 'love', now()), (${reply.message.id}, ${users[2]!}, 'laugh', now())`;
    await database.client`update public.messages set sequence = 9007199254740991 where id = ${fourth.message.id}`;

    await expect(repository.list(users[3]!, initial.conversation.id, "not-a-cursor", undefined, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.list(users[0]!, initial.conversation.id, undefined, "9007199254740992", 2)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    builderQueries.length = 0;
    await expect(observedRepository.list(users[0]!, initial.conversation.id, undefined, undefined, 2)).resolves.toMatchObject({
      items: [{ sequence: "3" }, { sequence: "9007199254740991" }],
      nextCursor: "9007199254740991",
      hasMore: true,
    });
    expect(builderQueries).toHaveLength(4);
    const pageForSender = await repository.list(users[0]!, initial.conversation.id, "3", undefined, 2);
    expect(pageForSender).toMatchObject({
      items: [
        { sequence: "1" },
        {
          sequence: "2",
          replyToMessageId: initial.message.id,
          replyPreview: { id: initial.message.id, senderId: users[0], text: "parent message", unsentAt: null },
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    const reactionsForSender = pageForSender.items[1]!.reactions;
    expect(reactionsForSender).toHaveLength(2);
    expect(reactionsForSender).toEqual(expect.arrayContaining([
      { reaction: "love", count: 2, reactedByActor: true },
      { reaction: "laugh", count: 1, reactedByActor: false },
    ]));
    await expect(repository.list(users[0]!, initial.conversation.id, undefined, "1", 2)).resolves.toMatchObject({
      items: [{ sequence: "2" }, { sequence: "3" }],
      nextCursor: "3",
      hasMore: true,
    });
    await expect(repository.list(users[0]!, initial.conversation.id, undefined, "9007199254740990", 2)).resolves.toMatchObject({
      items: [{ sequence: "9007199254740991" }],
      nextCursor: null,
      hasMore: false,
    });
    await expect(repository.list(users[1]!, initial.conversation.id, undefined, "1", 2)).resolves.toMatchObject({
      items: [{ sequence: "2", reactions: expect.arrayContaining(reactionsForSender) }, { sequence: "3" }],
    });
    const pageForThirdMember = await repository.list(users[2]!, initial.conversation.id, undefined, "1", 2);
    expect(pageForThirdMember).toMatchObject({ items: [{ sequence: "2" }, { sequence: "3" }] });
    const reactionsForThirdMember = pageForThirdMember.items[0]!.reactions;
    expect(reactionsForThirdMember).toHaveLength(2);
    expect(reactionsForThirdMember).toEqual(expect.arrayContaining([
      { reaction: "love", count: 2, reactedByActor: false },
      { reaction: "laugh", count: 1, reactedByActor: true },
    ]));

    await unsend.unsend(users[0]!, initial.conversation.id, initial.message.id);
    await expect(repository.list(users[1]!, initial.conversation.id, "3", undefined, 10)).resolves.toMatchObject({
      items: [
        { sequence: "1", text: null, reactions: [] },
        {
          sequence: "2",
          text: "reply message",
          replyPreview: { id: initial.message.id, senderId: users[0], text: null, unsentAt: expect.any(String) },
          reactions: expect.arrayContaining(reactionsForSender),
        },
      ],
    });

    await unsend.unsend(users[1]!, initial.conversation.id, reply.message.id);
    await expect(repository.list(users[0]!, initial.conversation.id, "3", undefined, 10)).resolves.toMatchObject({
      items: [
        { sequence: "1", text: null, reactions: [] },
        {
          sequence: "2",
          text: null,
          replyPreview: { id: initial.message.id, senderId: users[0], text: null, unsentAt: expect.any(String) },
          reactions: [],
        },
      ],
    });
    await expect(repository.list(users[3]!, initial.conversation.id, undefined, undefined, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await database.client`update public.messages set sequence = 9007199254740993 where id = ${fourth.message.id}`;
    await expect(repository.list(users[0]!, initial.conversation.id, undefined, undefined, 2)).rejects.toThrow(RangeError);
    await database.client`update public.messages set sequence = 4 where id = ${fourth.message.id}`;
  });

  it("rejects overflowing native message versions instead of rounding list DTOs", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflowing list version",
    });
    await database.client`update public.messages set version = 9007199254740993 where id = ${created.message.id}`;

    await expect(repository.list(users[0]!, created.conversation.id, undefined, undefined, 10))
      .rejects.toThrow("Database message version must be a positive safe integer.");
  });
});

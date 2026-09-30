import { createDayliDatabase, schema } from "@dayli/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresListConversationsRepository } from "../list-conversations.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
if (!connectionString) throw new Error("MESSAGING_TEST_DATABASE_URL is required for list conversations integration tests.");
const target = new URL(connectionString);
if (target.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}

describe("list conversations Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 8 }, (_, index) => `list-conversations-${crypto.randomUUID()}-${index}`);
  const { direct, send, unsend } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresListConversationsRepository(database.db);
  const builderQueries: string[] = [];
  const observedRepository = createPostgresListConversationsRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now()), (${users[0]!}, ${users[2]!}, 'active', now()), (${users[2]!}, ${users[0]!}, 'active', now()), (${users[0]!}, ${users[6]!}, 'active', now()), (${users[6]!}, ${users[0]!}, 'active', now())`;
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

  it("keeps membership, folders, blocks, precise cursors, pages, unread state, and latest-message DTOs", async () => {
    const activeWithUnread = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first active message",
    });
    const reply = await send.send(users[1]!, activeWithUnread.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "latest active message",
    });
    const activeWithoutUnread = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "second active message",
    });
    const activeWithSameActivity = await direct.create(users[0]!, {
      recipientId: users[6]!,
      clientMessageId: crypto.randomUUID(),
      text: "same activity message",
    });
    const incomingRequest = await direct.create(users[3]!, {
      recipientId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      text: "incoming request",
    });
    await direct.create(users[0]!, {
      recipientId: users[4]!,
      clientMessageId: crypto.randomUUID(),
      text: "outgoing request",
    });

    const sequence = "9007199254740991";
    const lastReadSequence = "9007199254740990";
    await database.client`update public.messages set sequence = ${sequence}::bigint where id = ${reply.message.id}`;
    await database.client`update public.conversations set last_message_sequence = ${sequence}::bigint where id = ${activeWithUnread.conversation.id}`;
    await database.client`
      update public.conversation_members
      set last_read_sequence = ${lastReadSequence}::bigint, receipt_sequence = ${lastReadSequence}::bigint
      where conversation_id = ${activeWithUnread.conversation.id} and user_id = ${users[0]!}
    `;
    await database.client`update public.conversations set last_activity_at = ${"2026-09-28T06:00:00.000001Z"}::timestamptz where id = ${activeWithUnread.conversation.id}`;
    await database.client`update public.conversations set last_activity_at = ${"2026-09-28T06:00:00.000002Z"}::timestamptz where id = ${activeWithoutUnread.conversation.id} or id = ${activeWithSameActivity.conversation.id}`;

    const tiedIds = [activeWithoutUnread.conversation.id, activeWithSameActivity.conversation.id].sort().reverse();
    builderQueries.length = 0;
    const first = await observedRepository.list(users[0]!, "inbox", undefined, 1);
    expect(builderQueries).toHaveLength(2);
    const listQuery = builderQueries[0]!;
    expect(listQuery).toContain("left join lateral");
    expect(listQuery).toContain("to_char");
    expect(listQuery).not.toContain('::text');
    expect(listQuery).not.toContain('::bigint');
    expect(listQuery).toContain('count(*)::int');
    builderQueries.length = 0;
    const second = await observedRepository.list(users[0]!, "inbox", first.nextCursor ?? undefined, 1);
    expect(builderQueries).toHaveLength(2);
    expect(builderQueries[0]).toContain('("conversations"."last_activity_at", "conversations"."id") < ($');
    const third = await repository.list(users[0]!, "inbox", second.nextCursor ?? undefined, 1);
    const [firstCursorActivity, firstCursorId] = JSON.parse(atob(first.nextCursor!)) as [string, string];
    const [secondCursorActivity, secondCursorId] = JSON.parse(atob(second.nextCursor!)) as [string, string];

    expect([firstCursorActivity, firstCursorId]).toEqual(["2026-09-28T06:00:00.000002+00", tiedIds[0]!]);
    expect([secondCursorActivity, secondCursorId]).toEqual(["2026-09-28T06:00:00.000002+00", tiedIds[1]!]);
    expect(first.items).toMatchObject([{ id: tiedIds[0] }]);
    expect(second.items).toMatchObject([{ id: tiedIds[1] }]);
    expect(third.items).toMatchObject([{ id: activeWithUnread.conversation.id }]);
    expect(third.nextCursor).toBeNull();

    const inbox = await repository.list(users[0]!, "inbox", undefined, 10);
    expect(inbox.items).toHaveLength(3);
    expect(inbox.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: activeWithUnread.conversation.id,
        peer: { id: users[1], name: null },
        requestState: "active",
        latestMessage: expect.objectContaining({
          id: reply.message.id,
          sequence,
          version: 1,
          senderId: users[1],
          text: "latest active message",
        }),
        unreadCount: 1,
        lastMessageSequence: sequence,
        lastReadSequence,
        receiptSequence: lastReadSequence,
        capabilities: { canSend: true, canResolveRequest: false },
      }),
    ]));

    await expect(repository.list(users[0]!, "requests", undefined, 10)).resolves.toMatchObject({
      items: [expect.objectContaining({
        id: incomingRequest.conversation.id,
        peer: { id: users[3], name: null },
        requestState: "pending",
        latestMessage: expect.objectContaining({ text: "incoming request", senderId: users[3] }),
        unreadCount: 1,
        capabilities: { canSend: false, canResolveRequest: true },
      })],
      nextCursor: null,
    });
    await expect(repository.list(users[7]!, "inbox", undefined, 10)).resolves.toEqual({ items: [], nextCursor: null });
    await expect(repository.list(users[7]!, "requests", undefined, 10)).resolves.toEqual({ items: [], nextCursor: null });

    await database.client`insert into public.message_reactions (message_id, user_id, reaction, created_at) values (${reply.message.id}, ${users[0]!}, 'love', now()), (${reply.message.id}, ${users[1]!}, 'love', now())`;
    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({
        id: activeWithUnread.conversation.id,
        latestMessage: expect.objectContaining({ version: 1, reactions: [{ reaction: "love", count: 2, reactedByActor: true }] }),
      })]),
    });
    await unsend.unsend(users[1]!, activeWithUnread.conversation.id, reply.message.id);
    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({
        id: activeWithUnread.conversation.id,
        latestMessage: expect.objectContaining({ text: null, unsentAt: expect.any(String), reactions: [] }),
      })]),
    });
    const blank = await direct.create(users[5]!, {
      recipientId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      text: "blank latest message",
    });
    await database.client`delete from public.messages where id = ${blank.message.id}`;
    await database.client`update public.conversations set last_message_sequence = 0, last_change_sequence = 0 where id = ${blank.conversation.id}`;
    await expect(repository.list(users[0]!, "requests", undefined, 10)).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ id: blank.conversation.id, latestMessage: null })]),
    });

    await database.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${users[0]!}, ${users[1]!}, now())
    `;
    await expect(repository.list(users[0]!, "inbox", undefined, 10)).resolves.toEqual(expect.objectContaining({
      items: expect.arrayContaining([expect.objectContaining({
        id: activeWithUnread.conversation.id,
        capabilities: { canSend: false, canResolveRequest: false },
      })]),
    }));
  });

  it("fails closed for overflowing native conversation and latest-message values", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflowing conversation latest values",
    });

    await database.client`update public.messages set sequence = 9007199254740993 where id = ${created.message.id}`;
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.client`update public.messages set sequence = ${created.message.sequence}::bigint where id = ${created.message.id}`;
    await database.client`update public.conversations set last_message_sequence = 9007199254740993 where id = ${created.conversation.id}`;
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.client`update public.conversations set last_message_sequence = ${created.message.sequence}::bigint, last_change_sequence = 9007199254740993 where id = ${created.conversation.id}`;
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.client`update public.conversations set last_change_sequence = 0 where id = ${created.conversation.id}`;
    await database.client`update public.conversation_members set last_read_sequence = 9007199254740993 where conversation_id = ${created.conversation.id} and user_id = ${users[0]!}`;
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    await database.client`update public.conversation_members set last_read_sequence = 0 where conversation_id = ${created.conversation.id} and user_id = ${users[0]!}`;
    await database.client`update public.messages set version = 9007199254740993 where id = ${created.message.id}`;
    await expect(repository.list(users[0]!, "inbox", undefined, 10))
      .rejects.toThrow("Database message version must be a positive safe integer.");
  });
});

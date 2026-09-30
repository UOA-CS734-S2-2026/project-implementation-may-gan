import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresListConversationChangesRepository } from "../list-conversation-changes.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("list conversation changes Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 3 }, (_, index) => `list-conversation-changes-${crypto.randomUUID()}-${index}`);
  const { direct, markConversationRead, send } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresListConversationChangesRepository(database.db);

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

  it("keeps membership private and returns ordered, strictly paginated near-safe changes after blocks", async () => {
    const first = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first message",
    });
    const second = await send.send(users[1]!, first.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "second message",
    });
    const third = await send.send(users[1]!, first.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "third message",
    });
    await markConversationRead.markRead(users[0]!, first.conversation.id, "3");

    const sequenceOffset = "9007199254740987";
    const firstSequence = "9007199254740988";
    const secondSequence = "9007199254740989";
    const thirdSequence = "9007199254740990";
    const fourthSequence = "9007199254740991";
    await database.client`
      update public.conversation_changes
      set change_sequence = change_sequence + ${sequenceOffset}::bigint
      where conversation_id = ${first.conversation.id}
    `;
    await database.client`
      update public.conversations
      set last_change_sequence = last_change_sequence + ${sequenceOffset}::bigint
      where id = ${first.conversation.id}
    `;

    await expect(repository.list(users[2]!, first.conversation.id, "9007199254740992", 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.list(users[0]!, first.conversation.id, "9007199254740992", 2))
      .rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await database.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${users[1]!}, ${users[0]!}, now())
    `;

    await expect(repository.list(users[0]!, first.conversation.id, undefined, 2)).resolves.toEqual({
      items: [
        {
          changeSequence: firstSequence,
          kind: "message.created",
          messageId: first.message.id,
          memberId: null,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
        {
          changeSequence: secondSequence,
          kind: "message.created",
          messageId: second.message.id,
          memberId: null,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
      nextChangeSequence: secondSequence,
      hasMore: true,
      highWatermark: fourthSequence,
    });

    await expect(repository.list(users[0]!, first.conversation.id, firstSequence, 2)).resolves.toEqual({
      items: [
        {
          changeSequence: secondSequence,
          kind: "message.created",
          messageId: second.message.id,
          memberId: null,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
        {
          changeSequence: thirdSequence,
          kind: "message.created",
          messageId: third.message.id,
          memberId: null,
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
      nextChangeSequence: thirdSequence,
      hasMore: true,
      highWatermark: fourthSequence,
    });

    await expect(repository.list(users[0]!, first.conversation.id, thirdSequence, 2)).resolves.toEqual({
      items: [
        {
          changeSequence: fourthSequence,
          kind: "read.updated",
          messageId: null,
          memberId: users[0],
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      ],
      nextChangeSequence: null,
      hasMore: false,
      highWatermark: fourthSequence,
    });
  });

  it("rejects overflowing native change sequences and high watermarks", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflowing change sequence",
    });

    await database.client`
      update public.conversation_changes
      set change_sequence = 9007199254740993
      where conversation_id = ${created.conversation.id}
    `;
    await expect(repository.list(users[0]!, created.conversation.id, "9007199254740991", 1))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    await database.client`
      update public.conversation_changes
      set change_sequence = 1
      where conversation_id = ${created.conversation.id}
    `;
    await database.client`
      update public.conversations
      set last_change_sequence = 9007199254740993
      where id = ${created.conversation.id}
    `;
    await expect(repository.list(users[0]!, created.conversation.id, undefined, 1))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
  });
});

import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresGetConversationRepository } from "../get-conversation.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("get conversation Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `get-conversation-${crypto.randomUUID()}-${index}`);
  const { direct, send } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresGetConversationRepository(database.db);

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

  it("keeps private membership, unread, latest-message, and capability semantics", async () => {
    const active = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first message",
    });
    const reply = await send.send(users[1]!, active.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "latest message",
    });
    const pending = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "message request",
    });

    await expect(repository.get(users[3]!, active.conversation.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(repository.get(users[0]!, active.conversation.id)).resolves.toMatchObject({
      id: active.conversation.id,
      peer: { id: users[1], name: null },
      requestState: "active",
      latestMessage: { id: reply.message.id, sequence: "2", senderId: users[1], text: "latest message" },
      unreadCount: 1,
      lastMessageSequence: "2",
      lastReadSequence: "0",
      receiptSequence: "0",
      capabilities: { canSend: true, canResolveRequest: false },
    });
    await expect(repository.get(users[2]!, pending.conversation.id)).resolves.toMatchObject({
      id: pending.conversation.id,
      peer: { id: users[0], name: null },
      requestState: "pending",
      latestMessage: { id: pending.message.id, sequence: "1", senderId: users[0], text: "message request" },
      unreadCount: 1,
      capabilities: { canSend: false, canResolveRequest: true },
    });

    const sequence = "9007199254740991";
    const lastReadSequence = "9007199254740990";
    await database.client`update public.messages set sequence = ${sequence}::bigint where id = ${reply.message.id}`;
    await database.client`update public.conversations set last_message_sequence = ${sequence}::bigint where id = ${active.conversation.id}`;
    await database.client`
      update public.conversation_members
      set last_read_sequence = ${lastReadSequence}::bigint, receipt_sequence = ${lastReadSequence}::bigint
      where conversation_id = ${active.conversation.id} and participant_id = ${users[0]!}
    `;

    await expect(repository.get(users[0]!, active.conversation.id)).resolves.toMatchObject({
      latestMessage: { id: reply.message.id, sequence, senderId: users[1], text: "latest message" },
      unreadCount: 1,
      lastMessageSequence: sequence,
      lastReadSequence,
      receiptSequence: lastReadSequence,
    });

    await database.client`update public.messages set sequence = 9007199254740993::bigint where id = ${reply.message.id}`;
    await expect(repository.get(users[0]!, active.conversation.id)).rejects.toThrow(RangeError);
    await database.client`update public.messages set sequence = ${sequence}::bigint where id = ${reply.message.id}`;

    await database.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${users[0]!}, ${users[1]!}, now())
    `;
    await expect(repository.get(users[0]!, active.conversation.id)).resolves.toMatchObject({
      id: active.conversation.id,
      capabilities: { canSend: false, canResolveRequest: false },
    });
  });
});

import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresMessageWriteStore } from "../send-message.repository";
import { createSendMessageService } from "../send-message.service";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("send message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const contender = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 5 }, (_, index) => `send-message-${crypto.randomUUID()}-${index}`);
  const { direct } = createMessagingPersistenceServices(database.db);
  const send = createSendMessageService({ store: createPostgresMessageWriteStore(database.db) });
  const contenderSend = createSendMessageService({ store: createPostgresMessageWriteStore(contender.db) });

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now()), (${users[0]!}, ${users[4]!}, 'active', now()), (${users[4]!}, ${users[0]!}, 'active', now())`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public.relationship_blocks where blocker_id = any(${users}::text[]) or blocked_id = any(${users}::text[])`;
      await database.client`delete from public.friendships where user_id = any(${users}::text[]) or friend_id = any(${users}::text[])`;
      await database.client`delete from public.friend_requests where sender_id = any(${users}::text[]) or recipient_id = any(${users}::text[])`;
      await database.client`delete from public."user" where id = any(${users}::text[])`;
    } finally {
      await Promise.all([database.close(), contender.close()]);
    }
  });

  it("enforces membership and atomically persists replies, idempotency, sequence, and realtime outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });

    await expect(send.send(users[2]!, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "not a member",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(send.send(users[0]!, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "missing parent",
      replyToMessageId: crypto.randomUUID(),
    })).rejects.toMatchObject({ code: "REPLY_NOT_FOUND" });

    const clientMessageId = crypto.randomUUID();
    const first = await send.send(users[0]!, created.conversation.id, {
      clientMessageId,
      text: "a reply",
      replyToMessageId: created.message.id,
    });
    expect(first).toMatchObject({
      replayed: false,
      message: { sequence: "2", replyToMessageId: created.message.id, text: "a reply" },
    });

    const replay = await send.send(users[0]!, created.conversation.id, {
      clientMessageId,
      text: "a reply",
      replyToMessageId: created.message.id,
    });
    expect(replay).toMatchObject({ replayed: true, message: { id: first.message.id, sequence: "2" } });

    await expect(send.send(users[0]!, created.conversation.id, {
      clientMessageId,
      text: "different payload",
      replyToMessageId: created.message.id,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    const [stored] = await database.client`select sequence, reply_to_message_id from public.messages where id = ${first.message.id}`;
    const changes = [...await database.client`select change_sequence, kind, message_id from public.conversation_changes where conversation_id = ${created.conversation.id} order by change_sequence`];
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id} and channel = 'realtime'`;
    expect(String(stored?.sequence)).toBe("2");
    expect(stored?.reply_to_message_id).toBe(created.message.id);
    expect(changes).toMatchObject([
      { change_sequence: "1", kind: "message.created", message_id: created.message.id },
      { change_sequence: "2", kind: "message.created", message_id: first.message.id },
    ]);
    expect(outbox?.count).toBe(4);
  });

  it("serializes concurrent sends from two PostgreSQL clients without losing message or change sequences", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });

    const [beforeChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id}`;
    const [beforeOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id} and channel = 'realtime'`;
    const results = await Promise.all([
      send.send(users[0]!, created.conversation.id, { clientMessageId: crypto.randomUUID(), text: "from first client" }),
      contenderSend.send(users[1]!, created.conversation.id, { clientMessageId: crypto.randomUUID(), text: "from second client" }),
    ]);

    const initialSequence = BigInt(created.message.sequence);
    const expectedSequences = [(initialSequence + 1n).toString(), (initialSequence + 2n).toString()];
    expect(results.map((result) => result.message.sequence).sort()).toEqual(expectedSequences);
    const messages = [...await database.client`select sequence::text as sequence from public.messages where id in (${results[0].message.id}, ${results[1].message.id}) order by sequence`];
    const changes = [...await database.client`select change_sequence::text as sequence from public.conversation_changes where message_id in (${results[0].message.id}, ${results[1].message.id}) order by change_sequence`];
    const [afterChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id}`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id} and channel = 'realtime'`;
    expect(messages.map((message) => message.sequence)).toEqual(expectedSequences);
    expect(changes.map((change) => change.sequence)).toEqual(expectedSequences);
    expect(afterChanges?.count).toBe((beforeChanges?.count ?? 0) + 2);
    expect(outbox?.count).toBe((beforeOutbox?.count ?? 0) + 4);
  });

  it("rejects unsafe text-mode message sequences and rolls back the write transaction", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });
    const [beforeMessageCount] = await database.client`select count(*)::int as count from public.messages where conversation_id = ${created.conversation.id}`;
    const [beforeChangeCount] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id}`;
    const [beforeOutboxCount] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`;
    await database.client`update public.conversations set last_message_sequence = 9007199254740992::bigint where id = ${created.conversation.id}`;

    await expect(send.send(users[0]!, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "unsafe",
    })).rejects.toThrow(RangeError);

    const [conversation] = await database.client`select last_message_sequence::text as sequence from public.conversations where id = ${created.conversation.id}`;
    const [messageCount] = await database.client`select count(*)::int as count from public.messages where conversation_id = ${created.conversation.id}`;
    const [changeCount] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id}`;
    const [outboxCount] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`;
    expect(conversation?.sequence).toBe("9007199254740992");
    expect(messageCount?.count).toBe(beforeMessageCount?.count);
    expect(changeCount?.count).toBe(beforeChangeCount?.count);
    expect(outboxCount?.count).toBe(beforeOutboxCount?.count);
  });

  it("rejects pending and blocked sends without additional messages, changes, or outbox work", async () => {
    const pending = await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "pending first",
    });
    await expect(send.send(users[0]!, pending.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "pending second",
    })).rejects.toMatchObject({ code: "PENDING" });

    const blocked = await direct.create(users[0]!, {
      recipientId: users[4]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked first",
    });
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[4]!}, ${users[0]!}, now())`;
    await expect(send.send(users[0]!, blocked.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "blocked second",
    })).rejects.toMatchObject({ code: "BLOCKED" });

    const [pendingMessages] = await database.client`select count(*)::int as count from public.messages where conversation_id = ${pending.conversation.id}`;
    const [pendingChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${pending.conversation.id}`;
    const [pendingOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${pending.conversation.id}`;
    const [blockedMessages] = await database.client`select count(*)::int as count from public.messages where conversation_id = ${blocked.conversation.id}`;
    const [blockedChanges] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${blocked.conversation.id}`;
    const [blockedOutbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${blocked.conversation.id}`;
    expect({ messages: pendingMessages?.count, changes: pendingChanges?.count, outbox: pendingOutbox?.count }).toEqual({ messages: 1, changes: 1, outbox: 2 });
    expect({ messages: blockedMessages?.count, changes: blockedChanges?.count, outbox: blockedOutbox?.count }).toEqual({ messages: 1, changes: 1, outbox: 2 });
  });
});

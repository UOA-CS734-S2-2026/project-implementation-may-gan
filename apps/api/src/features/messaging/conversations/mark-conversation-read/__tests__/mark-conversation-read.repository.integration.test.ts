import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresMarkConversationReadRepository } from "../mark-conversation-read.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("mark conversation read Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 10 }, (_, index) => `mark-conversation-read-${crypto.randomUUID()}-${index}`);
  const { direct, send } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresMarkConversationReadRepository(database.db);
  const concurrentRepository = createPostgresMarkConversationReadRepository(concurrentDatabase.db);

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now()), (${users[2]!}, ${users[3]!}, 'active', now()), (${users[3]!}, ${users[2]!}, 'active', now()), (${users[6]!}, ${users[7]!}, 'active', now()), (${users[7]!}, ${users[6]!}, 'active', now()), (${users[8]!}, ${users[9]!}, 'active', now()), (${users[9]!}, ${users[8]!}, 'active', now())`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public.relationship_blocks where blocker_id = any(${users}::text[]) or blocked_id = any(${users}::text[])`;
      await database.client`delete from public.friendships where user_id = any(${users}::text[]) or friend_id = any(${users}::text[])`;
      await database.client`delete from public.friend_requests where sender_id = any(${users}::text[]) or recipient_id = any(${users}::text[])`;
      await database.client`delete from public.user where id = any(${users}::text[])`;
    } finally {
      await concurrentDatabase.close();
      await database.close();
    }
  });

  it("clamps and monotonically advances the read cursor while recording active read retries", async () => {
    const conversation = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });
    await send.send(users[0]!, conversation.conversation.id, { clientMessageId: crypto.randomUUID(), text: "second" });
    await send.send(users[0]!, conversation.conversation.id, { clientMessageId: crypto.randomUUID(), text: "third" });

    await expect(repository.markRead(users[1]!, conversation.conversation.id, "99")).resolves.toEqual({
      lastReadSequence: "3",
      receiptSequence: "3",
      unreadCount: 0,
    });
    await expect(repository.markRead(users[1]!, conversation.conversation.id, "1")).resolves.toEqual({
      lastReadSequence: "3",
      receiptSequence: "3",
      unreadCount: 0,
    });
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversation.conversation.id} and kind = 'read.updated'`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversation.conversation.id}`;
    expect(changes?.count).toBe(2);
    expect(outbox?.count).toBe(10);
  });

  it("fails closed when locked conversation state overflows", async () => {
    const conversation = await direct.create(users[8]!, {
      recipientId: users[9]!,
      clientMessageId: crypto.randomUUID(),
      text: "high sequence",
    });
    const highSequence = "9007199254740993";
    await database.client`update public.messages set sequence = ${highSequence}::bigint where conversation_id = ${conversation.conversation.id}`;
    await database.client`update public.conversations set last_message_sequence = ${highSequence}::bigint where id = ${conversation.conversation.id}`;

    await expect(repository.markRead(users[9]!, conversation.conversation.id, "9007199254740994"))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
  });

  it("keeps pending and blocked reads private while advancing only the local cursor", async () => {
    const pending = await direct.create(users[4]!, {
      recipientId: users[5]!,
      clientMessageId: crypto.randomUUID(),
      text: "pending",
    });
    await expect(repository.markRead(users[5]!, pending.conversation.id, "1")).resolves.toEqual({
      lastReadSequence: "1",
      receiptSequence: "0",
      unreadCount: 0,
    });

    const blocked = await direct.create(users[2]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked",
    });
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[2]!}, ${users[3]!}, now())`;
    await expect(repository.markRead(users[3]!, blocked.conversation.id, "1")).resolves.toEqual({
      lastReadSequence: "1",
      receiptSequence: "0",
      unreadCount: 0,
    });

    for (const conversationId of [pending.conversation.id, blocked.conversation.id]) {
      const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversationId}`;
      const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversationId}`;
      expect(changes?.count).toBe(1);
      expect(outbox?.count).toBe(2);
    }
  });

  it("serializes concurrent read cursors without regressing the receipt", async () => {
    const conversation = await direct.create(users[6]!, {
      recipientId: users[7]!,
      clientMessageId: crypto.randomUUID(),
      text: "first",
    });
    await send.send(users[6]!, conversation.conversation.id, { clientMessageId: crypto.randomUUID(), text: "second" });
    await send.send(users[6]!, conversation.conversation.id, { clientMessageId: crypto.randomUUID(), text: "third" });

    const results = await Promise.all([
      repository.markRead(users[7]!, conversation.conversation.id, "1"),
      concurrentRepository.markRead(users[7]!, conversation.conversation.id, "3"),
    ]);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ lastReadSequence: "3", receiptSequence: "3", unreadCount: 0 }),
    ]));
    expect(results.every((result) => BigInt(result.receiptSequence) <= BigInt(result.lastReadSequence))).toBe(true);
    const [member] = await database.client`select last_read_sequence, receipt_sequence from public.conversation_members where conversation_id = ${conversation.conversation.id} and user_id = ${users[7]!}`;
    expect(member).toMatchObject({ last_read_sequence: "3", receipt_sequence: "3" });
  });
});

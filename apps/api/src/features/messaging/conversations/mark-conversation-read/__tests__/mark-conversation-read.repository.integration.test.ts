import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresMarkConversationReadRepository } from "../mark-conversation-read.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

async function waitFor(condition: () => Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(message);
}

suite("mark conversation read Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 16 }, (_, index) => `mark-conversation-read-${crypto.randomUUID()}-${index}`);
  const {
    conversationChanges,
    conversationMembers,
    conversations,
    friendRequests,
    friendships,
    messages,
    messagingOutbox,
    relationshipBlocks,
    user,
  } = schema;
  const { direct, send } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresMarkConversationReadRepository(database.db);
  const concurrentRepository = createPostgresMarkConversationReadRepository(concurrentDatabase.db);
  const builderQueries: string[] = [];
  // postgres-js is retained only as Drizzle's transport so this test can observe repository SQL.
  const observedRepository = createPostgresMarkConversationReadRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

  beforeAll(async () => {
    await database.db.insert(user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.insert(friendships).values([
      [0, 1], [1, 0], [2, 3], [3, 2], [6, 7], [7, 6], [8, 9], [9, 8], [10, 11], [11, 10], [12, 13], [13, 12], [14, 15], [15, 14],
    ].map(([userIndex, friendIndex]) => ({
      userId: users[userIndex!]!,
      friendId: users[friendIndex!]!,
      state: "active" as const,
      stateChangedAt: sql`now()`,
    })));
  });

  afterAll(async () => {
    try {
      await database.db.delete(relationshipBlocks).where(or(
        inArray(relationshipBlocks.blockerId, users),
        inArray(relationshipBlocks.blockedId, users),
      ));
      await database.db.delete(friendships).where(or(
        inArray(friendships.userId, users),
        inArray(friendships.friendId, users),
      ));
      await database.db.delete(friendRequests).where(or(
        inArray(friendRequests.senderId, users),
        inArray(friendRequests.recipientId, users),
      ));
      await database.db.delete(user).where(inArray(user.id, users));
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

    builderQueries.length = 0;
    await expect(observedRepository.markRead(users[1]!, conversation.conversation.id, "99")).resolves.toEqual({
      lastReadSequence: "3",
      receiptSequence: "3",
      unreadCount: 0,
    });
    const memberUpdate = builderQueries.find((query) => query.startsWith('update "conversation_members"'));
    const unreadQuery = builderQueries.find((query) => query.includes('count(*)') && query.includes('from "messages"'));
    expect(memberUpdate).toContain("greatest(");
    expect(memberUpdate?.match(/greatest\(/g)).toHaveLength(2);
    expect(memberUpdate).toContain("now()");
    expect(memberUpdate).not.toContain("::bigint");
    expect(memberUpdate).not.toContain("::text");
    expect(unreadQuery).toContain("count(*)");
    expect(unreadQuery).not.toContain("::bigint");
    await expect(repository.markRead(users[1]!, conversation.conversation.id, "1")).resolves.toEqual({
      lastReadSequence: "3",
      receiptSequence: "3",
      unreadCount: 0,
    });
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, conversation.conversation.id),
      eq(conversationChanges.kind, "read.updated"),
    ));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, conversation.conversation.id));
    expect(changeCount?.count).toBe(2);
    expect(outboxCount?.count).toBe(10);
  });

  it("accepts MAX_SAFE_INTEGER and fails closed for oversized input and database state", async () => {
    const conversation = await direct.create(users[8]!, {
      recipientId: users[9]!,
      clientMessageId: crypto.randomUUID(),
      text: "high sequence",
    });
    const maximumSafeSequence = "9007199254740991";
    await database.db.update(messages).set({ sequence: Number(maximumSafeSequence) }).where(eq(messages.conversationId, conversation.conversation.id));
    await database.db.update(conversations).set({ lastMessageSequence: Number(maximumSafeSequence) }).where(eq(conversations.id, conversation.conversation.id));

    await expect(repository.markRead(users[9]!, conversation.conversation.id, maximumSafeSequence)).resolves.toEqual({
      lastReadSequence: maximumSafeSequence,
      receiptSequence: maximumSafeSequence,
      unreadCount: 0,
    });
    await expect(repository.markRead(users[9]!, conversation.conversation.id, "9007199254740992"))
      .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(repository.markRead(users[9]!, crypto.randomUUID(), "9007199254740992"))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    // bigint(mode: number) would round this value; keep the bounded expression in the typed update.
    await database.db.update(conversations).set({ lastMessageSequence: sql`9007199254740993::bigint` }).where(eq(conversations.id, conversation.conversation.id));
    await expect(repository.markRead(users[9]!, conversation.conversation.id, "1"))
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
    await database.db.insert(relationshipBlocks).values({
      blockerId: users[2]!,
      blockedId: users[3]!,
      blockedAt: sql`now()`,
    });
    await expect(repository.markRead(users[3]!, blocked.conversation.id, "1")).resolves.toEqual({
      lastReadSequence: "1",
      receiptSequence: "0",
      unreadCount: 0,
    });

    for (const conversationId of [pending.conversation.id, blocked.conversation.id]) {
      const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, conversationId));
      const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, conversationId));
      expect(changeCount?.count).toBe(1);
      expect(outboxCount?.count).toBe(2);
    }
  });

  it("waits for lifecycle, then advances only a private read cursor without a shared receipt", async () => {
    const conversation = await direct.create(users[14]!, {
      recipientId: users[15]!, clientMessageId: crypto.randomUUID(), text: "private after lifecycle",
    });
    const holder = createDayliDatabase(connectionString!);
    const inspector = createDayliDatabase(connectionString!);
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let lifecycleWritten: (() => void) | undefined;
    const written = new Promise<void>((resolve) => { lifecycleWritten = resolve; });
    try {
      const [holderBackend] = await holder.client`select pg_backend_pid() as pid`;
      const [contenderBackend] = await concurrentDatabase.client`select pg_backend_pid() as pid`;
      const holderPid = Number(holderBackend?.pid);
      const contenderPid = Number(contenderBackend?.pid);
      const transition = holder.client.begin(async (tx) => {
        await tx`select id from public."user" where id = ${users[14]!} for update`;
        await tx`
          insert into public.account_lifecycles
            (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
          values (${users[14]!}, 'pending_deletion', ${crypto.randomUUID()}, ${"e".repeat(64)}, 1, now(), now() + interval '168 hours', now() + interval '336 hours')
        `;
        lifecycleWritten?.();
        await held;
      });
      await written;
      const read = concurrentRepository.markRead(users[15]!, conversation.conversation.id, conversation.message.sequence);
      await waitFor(async () => {
        const [row] = await inspector.client`select ${holderPid} = any(pg_blocking_pids(${contenderPid})) as blocked`;
        return row?.blocked === true;
      }, "Expected mark-read to wait for the lifecycle user lock.");
      release!();
      await transition;
      await expect(read).resolves.toEqual({
        lastReadSequence: conversation.message.sequence,
        receiptSequence: "0",
        unreadCount: 0,
      });
      const [member] = await database.db.select({
        lastReadSequence: conversationMembers.lastReadSequence,
        receiptSequence: conversationMembers.receiptSequence,
      }).from(conversationMembers).where(and(
        eq(conversationMembers.conversationId, conversation.conversation.id),
        eq(conversationMembers.userId, users[15]!),
      ));
      const [receiptCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
        eq(conversationChanges.conversationId, conversation.conversation.id),
        eq(conversationChanges.kind, "read.updated"),
      ));
      expect(member).toMatchObject({ lastReadSequence: Number(conversation.message.sequence), receiptSequence: 0 });
      expect(receiptCount?.count).toBe(0);
    } finally {
      release?.();
      await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, users[14]!));
      await Promise.all([holder.close(), inspector.close()]);
    }
  });

  it("fails closed when the database returns an oversized cursor", async () => {
    const conversation = await direct.create(users[10]!, {
      recipientId: users[11]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflow cursor",
    });
    // Trigger DDL has no Drizzle builder equivalent, so execute it through parameterized Drizzle SQL.
    await database.db.execute(sql`
      create function public.mark_read_overflow_result() returns trigger language plpgsql as $$
      begin
        new.last_read_sequence := 9007199254740993;
        new.receipt_sequence := 9007199254740993;
        return new;
      end;
      $$
    `);
    await database.db.execute(sql`
      create trigger mark_read_overflow_result
      before update on public.conversation_members
      for each row execute function public.mark_read_overflow_result()
    `);

    try {
      await expect(repository.markRead(users[11]!, conversation.conversation.id, "1"))
        .rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    } finally {
      // Trigger DDL has no Drizzle builder equivalent, so execute it through parameterized Drizzle SQL.
      await database.db.execute(sql`drop trigger mark_read_overflow_result on public.conversation_members`);
      await database.db.execute(sql`drop function public.mark_read_overflow_result()`);
    }

    const [member] = await database.db.select({
      lastReadSequence: conversationMembers.lastReadSequence,
      receiptSequence: conversationMembers.receiptSequence,
    }).from(conversationMembers).where(and(
      eq(conversationMembers.conversationId, conversation.conversation.id),
      eq(conversationMembers.userId, users[11]!),
    ));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, conversation.conversation.id),
      eq(conversationChanges.kind, "read.updated"),
    ));
    expect(member).toMatchObject({ lastReadSequence: 0, receiptSequence: 0 });
    expect(changeCount?.count).toBe(0);
  });

  it("rolls back the local cursor when a read change would exceed MAX_SAFE_INTEGER", async () => {
    const conversation = await direct.create(users[12]!, {
      recipientId: users[13]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflow change",
    });
    await database.db.update(conversations).set({ lastChangeSequence: Number.MAX_SAFE_INTEGER }).where(eq(conversations.id, conversation.conversation.id));

    await expect(repository.markRead(users[13]!, conversation.conversation.id, "1"))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    const [member] = await database.db.select({
      lastReadSequence: conversationMembers.lastReadSequence,
      receiptSequence: conversationMembers.receiptSequence,
    }).from(conversationMembers).where(and(
      eq(conversationMembers.conversationId, conversation.conversation.id),
      eq(conversationMembers.userId, users[13]!),
    ));
    const [stored] = await database.db.select({ lastChangeSequence: conversations.lastChangeSequence }).from(conversations).where(eq(conversations.id, conversation.conversation.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, conversation.conversation.id),
      eq(conversationChanges.kind, "read.updated"),
    ));
    expect(member).toMatchObject({ lastReadSequence: 0, receiptSequence: 0 });
    expect(String(stored?.lastChangeSequence)).toBe("9007199254740991");
    expect(changeCount?.count).toBe(0);
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
    const [member] = await database.db.select({
      lastReadSequence: conversationMembers.lastReadSequence,
      receiptSequence: conversationMembers.receiptSequence,
    }).from(conversationMembers).where(and(
      eq(conversationMembers.conversationId, conversation.conversation.id),
      eq(conversationMembers.userId, users[7]!),
    ));
    expect(member).toMatchObject({ lastReadSequence: 3, receiptSequence: 3 });
  });
});

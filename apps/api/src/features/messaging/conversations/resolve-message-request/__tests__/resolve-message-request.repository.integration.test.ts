import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, count, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresResolveMessageRequestRepository } from "../resolve-message-request.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
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

suite("resolve message request Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 19 }, (_, index) => `resolve-message-request-${crypto.randomUUID()}-${index}`);
  const acceptingParticipantId = users[1]! < users[0]!
    ? `a-resolve-accept-participant-${crypto.randomUUID()}`
    : `z-resolve-accept-participant-${crypto.randomUUID()}`;
  const decliningParticipantId = users[14]! < users[13]!
    ? `a-resolve-decline-participant-${crypto.randomUUID()}`
    : `z-resolve-decline-participant-${crypto.randomUUID()}`;
  const {
    accountLifecycles,
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
  const repository = createPostgresResolveMessageRequestRepository(database.db);
  const concurrentRepository = createPostgresResolveMessageRequestRepository(concurrentDatabase.db);
  const builderQueries: string[] = [];
  // postgres-js is retained only as Drizzle's transport so this test can observe repository SQL.
  const observedRepository = createPostgresResolveMessageRequestRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

  async function assertAcceptanceCannotRacePendingLifecycle(
    lifecycleChange: "insert" | "update",
    senderId: string,
    recipientId: string,
  ): Promise<void> {
    const created = await direct.create(senderId, {
      recipientId,
      clientMessageId: crypto.randomUUID(),
      text: `lifecycle ${lifecycleChange} race`,
    });
    if (lifecycleChange === "update") {
      await database.db.insert(accountLifecycles).values({ userId: senderId });
    }

    const holder = createDayliDatabase(connectionString!);
    const inspector = createDayliDatabase(connectionString!);
    const accepting = createDayliDatabase(connectionString!);
    let releaseHolder: (() => void) | undefined;
    const holderReleased = new Promise<void>((resolve) => { releaseHolder = resolve; });
    let pendingLifecycleWritten: (() => void) | undefined;
    const lifecycleWritten = new Promise<void>((resolve) => { pendingLifecycleWritten = resolve; });
    let holderOutcome: Promise<{ status: "fulfilled" } | { status: "rejected"; error: unknown }> | undefined;

    try {
      const [holderBackend] = await holder.client`select pg_backend_pid() as pid`;
      const [acceptingBackend] = await accepting.client`select pg_backend_pid() as pid`;
      const holderPid = Number(holderBackend?.pid);
      const acceptingPid = Number(acceptingBackend?.pid);
      const requestId = crypto.randomUUID();
      holderOutcome = holder.client.begin(async (tx) => {
        await tx`select id from public."user" where id = ${senderId} for update`;
        if (lifecycleChange === "insert") {
          await tx`
            insert into public.account_lifecycles
              (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
            values (${senderId}, 'pending_deletion', ${requestId}, ${"d".repeat(64)}, 1, now(), now() + interval '168 hours', now() + interval '336 hours')
          `;
        } else {
          await tx`
            update public.account_lifecycles
            set state = 'pending_deletion', request_id = ${requestId}, idempotency_key_digest = ${"d".repeat(64)},
                generation = 1, requested_at = now(), cancel_until = now() + interval '168 hours', purge_due_at = now() + interval '336 hours'
            where user_id = ${senderId}
          `;
        }
        pendingLifecycleWritten?.();
        await holderReleased;
      }).then(
        () => ({ status: "fulfilled" as const }),
        (error) => ({ status: "rejected" as const, error }),
      );
      await lifecycleWritten;

      const acceptingRepository = createPostgresResolveMessageRequestRepository(accepting.db);
      const acceptanceOutcome = acceptingRepository.resolve(recipientId, created.conversation.id, "accept").then(
        () => ({ status: "fulfilled" as const }),
        (error) => ({ status: "rejected" as const, error }),
      );
      await waitFor(async () => {
        const [row] = await inspector.client`
          select ${holderPid} = any(pg_blocking_pids(${acceptingPid})) as blocked
        `;
        return row?.blocked === true;
      }, "Expected request acceptance to block on the lifecycle user lock.");

      if (!releaseHolder) throw new Error("Lifecycle lock release barrier was not initialized.");
      releaseHolder();
      await expect(holderOutcome).resolves.toEqual({ status: "fulfilled" });
      await expect(acceptanceOutcome).resolves.toMatchObject({ status: "rejected", error: { code: "FORBIDDEN" } });

      await expect(send.send(recipientId, created.conversation.id, {
        clientMessageId: crypto.randomUUID(),
        text: "must remain pending after lifecycle contention",
      })).rejects.toMatchObject({ code: "PENDING" });
      const [conversation] = await database.db.select({ requestState: conversations.requestState })
        .from(conversations)
        .where(eq(conversations.id, created.conversation.id));
      const [activeChanges] = await database.db.select({ count: count() })
        .from(conversationChanges)
        .where(and(eq(conversationChanges.conversationId, created.conversation.id), eq(conversationChanges.kind, "request.active")));
      const [outboxCount] = await database.db.select({ count: count() })
        .from(messagingOutbox)
        .where(eq(messagingOutbox.conversationId, created.conversation.id));
      const [friendshipCount] = await database.db.select({ count: count() })
        .from(friendships)
        .where(or(
          and(eq(friendships.userId, senderId), eq(friendships.friendId, recipientId)),
          and(eq(friendships.userId, recipientId), eq(friendships.friendId, senderId)),
        ));
      expect(conversation?.requestState).toBe("pending");
      expect(activeChanges?.count).toBe(0);
      expect(outboxCount?.count).toBe(2);
      expect(friendshipCount?.count).toBe(0);
    } finally {
      releaseHolder?.();
      if (holderOutcome) await holderOutcome;
      await holder.close();
      await inspector.close();
      await accepting.close();
    }
  }

  beforeAll(async () => {
    await database.db.insert(user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.update(schema.messagingParticipants).set({ id: acceptingParticipantId })
      .where(eq(schema.messagingParticipants.userId, users[1]!));
    await database.db.update(schema.messagingParticipants).set({ id: decliningParticipantId })
      .where(eq(schema.messagingParticipants.userId, users[14]!));
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

  it("accepts a pending request, persists its change and projects after commit", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "accept me",
    });
    await expect(repository.resolve(users[1]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
      capabilities: { canSend: true, canResolveRequest: false },
    });
    await expect(repository.resolve(users[1]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
    });
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, created.conversation.id),
      eq(conversationChanges.kind, "request.active"),
    ));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(4);
    const [change] = await database.db.select({
      memberId: conversationChanges.memberId,
      memberParticipantId: conversationChanges.memberParticipantId,
    }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, created.conversation.id),
      eq(conversationChanges.kind, "request.active"),
    ));
    expect(change).toEqual({ memberId: users[1], memberParticipantId: acceptingParticipantId });
  });

  it("refuses activation for a pending-deletion peer but permits decline", async () => {
    const created = await direct.create(users[13]!, {
      recipientId: users[14]!,
      clientMessageId: crypto.randomUUID(),
      text: "unavailable request sender",
    });
    const requestedAt = new Date();
    await database.db.insert(accountLifecycles).values({
      userId: users[13]!,
      state: "pending_deletion",
      requestId: crypto.randomUUID(),
      idempotencyKeyDigest: "c".repeat(64),
      generation: 1,
      requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    });

    await expect(repository.resolve(users[14]!, created.conversation.id, "accept"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(send.send(users[14]!, created.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "must remain pending",
    })).rejects.toMatchObject({ code: "PENDING" });

    const [afterRejectedAccept] = await database.db.select({ requestState: conversations.requestState })
      .from(conversations)
      .where(eq(conversations.id, created.conversation.id));
    const [activeChangeCount] = await database.db.select({ count: count() })
      .from(conversationChanges)
      .where(and(
        eq(conversationChanges.conversationId, created.conversation.id),
        eq(conversationChanges.kind, "request.active"),
      ));
    const [initialOutboxCount] = await database.db.select({ count: count() })
      .from(messagingOutbox)
      .where(eq(messagingOutbox.conversationId, created.conversation.id));
    const [friendshipCount] = await database.db.select({ count: count() })
      .from(friendships)
      .where(or(
        and(eq(friendships.userId, users[13]!), eq(friendships.friendId, users[14]!)),
        and(eq(friendships.userId, users[14]!), eq(friendships.friendId, users[13]!)),
      ));
    expect(afterRejectedAccept?.requestState).toBe("pending");
    expect(activeChangeCount?.count).toBe(0);
    expect(initialOutboxCount?.count).toBe(2);
    expect(friendshipCount?.count).toBe(0);

    await expect(repository.resolve(users[14]!, created.conversation.id, "decline"))
      .resolves.toMatchObject({ requestState: "declined", capabilities: { canSend: false, canResolveRequest: false } });
    const [declineChange] = await database.db.select({
      memberId: conversationChanges.memberId,
      memberParticipantId: conversationChanges.memberParticipantId,
    }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, created.conversation.id),
      eq(conversationChanges.kind, "request.declined"),
    ));
    expect(declineChange).toEqual({ memberId: users[14], memberParticipantId: decliningParticipantId });
  });

  it("rejects acceptance when a pending lifecycle is inserted while its user lock is held", async () => {
    await assertAcceptanceCannotRacePendingLifecycle("insert", users[15]!, users[16]!);
  });

  it("rejects acceptance when an active lifecycle becomes pending while its user lock is held", async () => {
    await assertAcceptanceCannotRacePendingLifecycle("update", users[17]!, users[18]!);
  });

  it("uses native response reads at MAX_SAFE_INTEGER", async () => {
    const created = await direct.create(users[9]!, {
      recipientId: users[10]!,
      clientMessageId: crypto.randomUUID(),
      text: "high sequence",
    });
    const maximumSafeSequence = "9007199254740991";
    const previousSequence = "9007199254740990";
    await database.db.update(messages).set({
      sequence: Number(maximumSafeSequence),
      version: Number(maximumSafeSequence),
    }).where(eq(messages.id, created.message.id));
    await database.db.update(conversations).set({
      lastMessageSequence: Number(maximumSafeSequence),
      lastChangeSequence: Number(previousSequence),
    }).where(eq(conversations.id, created.conversation.id));
    await database.db.update(conversationMembers).set({
      lastReadSequence: Number(previousSequence),
      receiptSequence: Number(previousSequence),
    }).where(and(
      eq(conversationMembers.conversationId, created.conversation.id),
      eq(conversationMembers.userId, users[10]!),
    ));

    builderQueries.length = 0;
    await expect(observedRepository.resolve(users[10]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
      latestMessage: { id: created.message.id, sequence: maximumSafeSequence, version: Number.MAX_SAFE_INTEGER },
      unreadCount: 1,
      lastMessageSequence: maximumSafeSequence,
      lastChangeSequence: maximumSafeSequence,
      lastReadSequence: previousSequence,
      receiptSequence: previousSequence,
    });
    expect(builderQueries).toHaveLength(17);
    const responseQueries = builderQueries.slice(-5);
    expect(responseQueries).toHaveLength(5);
    const latestQuery = responseQueries.find((query) => query.includes('order by "messages"."sequence" desc'));
    const unreadQuery = responseQueries.find((query) => query.includes("count(*)"));
    expect(latestQuery).toBeDefined();
    expect(latestQuery).not.toContain("::text");
    expect(unreadQuery).toBeDefined();
    expect(unreadQuery).not.toContain("::int");
    expect(unreadQuery).not.toContain("::bigint");
  });

  it("rolls back resolution state and outbox work when the change sequence overflows", async () => {
    const created = await direct.create(users[11]!, {
      recipientId: users[12]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflow resolution",
    });
    await database.db.update(conversations).set({ lastChangeSequence: Number.MAX_SAFE_INTEGER }).where(eq(conversations.id, created.conversation.id));

    await expect(repository.resolve(users[12]!, created.conversation.id, "accept"))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    const [conversation] = await database.db.select({
      requestState: conversations.requestState,
      lastChangeSequence: conversations.lastChangeSequence,
    }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(conversation).toMatchObject({ requestState: "pending" });
    expect(String(conversation?.lastChangeSequence)).toBe("9007199254740991");
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(2);
  });

  it("declines once and treats the recipient retry as a no-op", async () => {
    const created = await direct.create(users[2]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "decline me",
    });

    await expect(repository.resolve(users[3]!, created.conversation.id, "decline")).resolves.toMatchObject({ requestState: "declined" });
    await expect(repository.resolve(users[3]!, created.conversation.id, "decline")).resolves.toMatchObject({ requestState: "declined" });
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, created.conversation.id),
      eq(conversationChanges.kind, "request.declined"),
    ));
    const [outboxCount] = await database.db.select({ count: count() }).from(messagingOutbox).where(eq(messagingOutbox.conversationId, created.conversation.id));
    expect(changeCount?.count).toBe(1);
    expect(outboxCount?.count).toBe(4);
  });

  it("rejects blocked resolution without exposing a new change", async () => {
    const created = await direct.create(users[4]!, {
      recipientId: users[5]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked request",
    });
    await database.db.insert(relationshipBlocks).values({
      blockerId: users[4]!,
      blockedId: users[5]!,
      blockedAt: sql`now()`,
    });

    const resolutions = await Promise.allSettled([
      repository.resolve(users[5]!, created.conversation.id, "accept"),
      concurrentRepository.resolve(users[5]!, created.conversation.id, "accept"),
    ]);
    for (const resolution of resolutions) {
      expect(resolution).toMatchObject({ status: "rejected", reason: { code: "BLOCKED" } });
    }
    const [conversation] = await database.db.select({ requestState: conversations.requestState }).from(conversations).where(eq(conversations.id, created.conversation.id));
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(eq(conversationChanges.conversationId, created.conversation.id));
    expect(conversation).toMatchObject({ requestState: "pending" });
    expect(changeCount?.count).toBe(1);
  });

  it("keeps non-members private and forbids the request initiator", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "private request",
    });

    await expect(repository.resolve(users[8]!, created.conversation.id, "accept")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.resolve(users[0]!, created.conversation.id, "accept")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serializes concurrent identical resolutions into one accepted change", async () => {
    const created = await direct.create(users[6]!, {
      recipientId: users[7]!,
      clientMessageId: crypto.randomUUID(),
      text: "race request",
    });

    await expect(Promise.all([
      repository.resolve(users[7]!, created.conversation.id, "accept"),
      concurrentRepository.resolve(users[7]!, created.conversation.id, "accept"),
    ])).resolves.toEqual([
      expect.objectContaining({ requestState: "active" }),
      expect.objectContaining({ requestState: "active" }),
    ]);
    const [changeCount] = await database.db.select({ count: count() }).from(conversationChanges).where(and(
      eq(conversationChanges.conversationId, created.conversation.id),
      eq(conversationChanges.kind, "request.active"),
    ));
    const [conversation] = await database.db.select({ requestState: conversations.requestState }).from(conversations).where(eq(conversations.id, created.conversation.id));
    expect(changeCount?.count).toBe(1);
    expect(conversation).toMatchObject({ requestState: "active" });
  });
});

import { createDayliDatabase, schema } from "@dayli/db";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";

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

suite("set reaction Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const contender = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 3 }, (_, index) => `set-reaction-${crypto.randomUUID()}-${index}`);
  const divergentParticipantId = users[2]! < users[0]!
    ? `a-set-reaction-participant-${crypto.randomUUID()}`
    : `z-set-reaction-participant-${crypto.randomUUID()}`;
  const { direct, set: setReaction } = createMessagingPersistenceServices(database.db);
  const { set: contenderSetReaction } = createMessagingPersistenceServices(contender.db);

  beforeAll(async () => {
    const now = new Date();
    await database.db.insert(schema.user).values(users.map((id) => ({ id, name: id, email: `${id}@example.test` })));
    await database.db.update(schema.messagingParticipants).set({ id: divergentParticipantId })
      .where(eq(schema.messagingParticipants.userId, users[2]!));
    await database.db.insert(schema.friendships).values([
      { userId: users[0]!, friendId: users[1]!, state: "active", stateChangedAt: now },
      { userId: users[1]!, friendId: users[0]!, state: "active", stateChangedAt: now },
      { userId: users[0]!, friendId: users[2]!, state: "active", stateChangedAt: now },
      { userId: users[2]!, friendId: users[0]!, state: "active", stateChangedAt: now },
    ]);
  });

  afterAll(async () => {
    try {
      await database.db.delete(schema.relationshipBlocks).where(or(
        inArray(schema.relationshipBlocks.blockerId, users),
        inArray(schema.relationshipBlocks.blockedId, users),
      ));
      await database.db.delete(schema.friendships).where(or(
        inArray(schema.friendships.userId, users),
        inArray(schema.friendships.friendId, users),
      ));
      await database.db.delete(schema.friendRequests).where(or(
        inArray(schema.friendRequests.senderId, users),
        inArray(schema.friendRequests.recipientId, users),
      ));
      await database.db.delete(schema.user).where(inArray(schema.user.id, users));
    } finally {
      await Promise.all([database.close(), contender.close()]);
    }
  });

  it("waits for a pending peer cancellation before allowing a positive reaction", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "cancellation reaction contender",
    });
    const requestedAt = new Date();
    await database.db.insert(schema.accountLifecycles).values({
      userId: users[0]!, state: "pending_deletion", requestId: crypto.randomUUID(),
      idempotencyKeyDigest: "c".repeat(64), generation: 1, requestedAt,
      cancelUntil: new Date(requestedAt.getTime() + 168 * 60 * 60 * 1000),
      purgeDueAt: new Date(requestedAt.getTime() + 336 * 60 * 60 * 1000),
    });
    const holder = createDayliDatabase(connectionString!);
    const inspector = createDayliDatabase(connectionString!);
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let cancellationWritten: (() => void) | undefined;
    const written = new Promise<void>((resolve) => { cancellationWritten = resolve; });
    try {
      const [holderBackend] = await holder.client`select pg_backend_pid() as pid`;
      const [contenderBackend] = await contender.client`select pg_backend_pid() as pid`;
      const holderPid = Number(holderBackend?.pid);
      const contenderPid = Number(contenderBackend?.pid);
      const cancellation = holder.client.begin(async (tx) => {
        await tx`select id from public."user" where id = ${users[0]!} for update`;
        await tx`delete from public.account_lifecycles where user_id = ${users[0]!}`;
        cancellationWritten?.();
        await held;
      });
      await written;
      const outcome = contenderSetReaction.set(users[1]!, created.conversation.id, created.message.id, "angry");
      await waitFor(async () => {
        const [row] = await inspector.client`select ${holderPid} = any(pg_blocking_pids(${contenderPid})) as blocked`;
        return row?.blocked === true;
      }, "Expected positive reaction to wait for the pending peer's user lock.");
      release!();
      await cancellation;
      await expect(outcome).resolves.toMatchObject({ changed: true, message: { reactions: [{ reaction: "angry", reactedByActor: true }] } });
    } finally {
      release?.();
      await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, users[0]!));
      await database.db.delete(schema.conversations).where(eq(schema.conversations.id, created.conversation.id));
      await Promise.all([holder.close(), inspector.close()]);
    }
  });

  it("waits for a concurrent lifecycle transition, then rejects a new reaction", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "lifecycle reaction contender",
    });
    const holder = createDayliDatabase(connectionString!);
    const inspector = createDayliDatabase(connectionString!);
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let lifecycleWritten: (() => void) | undefined;
    const written = new Promise<void>((resolve) => { lifecycleWritten = resolve; });
    try {
      const [holderBackend] = await holder.client`select pg_backend_pid() as pid`;
      const [contenderBackend] = await contender.client`select pg_backend_pid() as pid`;
      const holderPid = Number(holderBackend?.pid);
      const contenderPid = Number(contenderBackend?.pid);
      const requestId = crypto.randomUUID();
      const transition = holder.client.begin(async (tx) => {
        await tx`select id from public."user" where id = ${users[0]!} for update`;
        await tx`
          insert into public.account_lifecycles
            (user_id, state, request_id, idempotency_key_digest, generation, requested_at, cancel_until, purge_due_at)
          values (${users[0]!}, 'pending_deletion', ${requestId}, ${"a".repeat(64)}, 1, now(), now() + interval '168 hours', now() + interval '336 hours')
        `;
        lifecycleWritten?.();
        await held;
      });
      await written;
      const outcome = contenderSetReaction.set(users[1]!, created.conversation.id, created.message.id, "angry");
      await waitFor(async () => {
        const [row] = await inspector.client`select ${holderPid} = any(pg_blocking_pids(${contenderPid})) as blocked`;
        return row?.blocked === true;
      }, "Expected reaction to wait for the lifecycle user lock.");
      release!();
      await transition;
      await expect(outcome).rejects.toMatchObject({ code: "FORBIDDEN" });
      const reactions = await database.db.select({ count: sql<number>`count(*)::int` })
        .from(schema.messageReactions)
        .where(eq(schema.messageReactions.messageId, created.message.id));
      expect(reactions[0]?.count).toBe(0);
    } finally {
      release?.();
      await database.db.delete(schema.accountLifecycles).where(eq(schema.accountLifecycles.userId, users[0]!));
      await database.db.delete(schema.conversations).where(eq(schema.conversations.id, created.conversation.id));
      await Promise.all([holder.close(), inspector.close()]);
    }
  });

  it("writes angry reactions and change actors with a divergent durable participant", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[2]!, clientMessageId: crypto.randomUUID(), text: "durable reaction",
    });

    await expect(setReaction.set(users[2]!, created.conversation.id, created.message.id, "angry"))
      .resolves.toMatchObject({ changed: true, message: { reactions: [{ reaction: "angry", reactedByActor: true }] } });
    const [reaction] = await database.db.select({
      userId: schema.messageReactions.userId,
      participantId: schema.messageReactions.participantId,
      reaction: schema.messageReactions.reaction,
    }).from(schema.messageReactions).where(eq(schema.messageReactions.messageId, created.message.id));
    const [change] = await database.db.select({
      memberId: schema.conversationChanges.memberId,
      memberParticipantId: schema.conversationChanges.memberParticipantId,
    }).from(schema.conversationChanges).where(and(
      eq(schema.conversationChanges.conversationId, created.conversation.id),
      eq(schema.conversationChanges.kind, "reaction.changed"),
    ));
    expect(reaction).toEqual({ userId: users[2], participantId: divergentParticipantId, reaction: "angry" });
    expect(change).toEqual({ memberId: users[2], memberParticipantId: divergentParticipantId });
  });

  it("authorizes reactions, leaves same reactions unchanged, and persists changes with realtime outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "react to this",
    });
    const { conversation } = created;
    const { message } = created;

    await expect(setReaction.set(users[2]!, conversation.id, message.id, "love")).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "love")).resolves.toMatchObject({
      changed: true,
      message: { reactions: [{ reaction: "love", count: 1, reactedByActor: true }] },
    });
    const [initialChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, conversation.id), eq(schema.conversationChanges.kind, "reaction.changed")));
    const [initialOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(initialChanges?.count).toBe(1);
    expect(initialOutbox?.count).toBe(4);

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "love")).resolves.toMatchObject({ changed: false });
    const [unchangedChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, conversation.id), eq(schema.conversationChanges.kind, "reaction.changed")));
    const [unchangedOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(unchangedChanges?.count).toBe(1);
    expect(unchangedOutbox?.count).toBe(4);

    await expect(setReaction.set(users[1]!, conversation.id, message.id, "laugh")).resolves.toMatchObject({
      changed: true,
      message: { reactions: [{ reaction: "laugh", count: 1, reactedByActor: true }] },
    });
    const [changedChanges] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.conversationChanges)
      .where(and(eq(schema.conversationChanges.conversationId, conversation.id), eq(schema.conversationChanges.kind, "reaction.changed")));
    const [changedOutbox] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.messagingOutbox)
      .where(and(eq(schema.messagingOutbox.conversationId, conversation.id), eq(schema.messagingOutbox.channel, "realtime")));
    expect(changedChanges?.count).toBe(2);
    expect(changedOutbox?.count).toBe(6);
  });
});

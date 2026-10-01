import { createDayliDatabase, schema, sql } from "@dayli/db";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices, createRelationshipsService } from "../../../app";
import { createHyperdriveRelationshipsStore, createPostgresRelationshipsStore } from "./relationships.repository";

/**
 * These tests must use a disposable database containing migration 0006.
 * Refuse the shared local fixture: other agents use it concurrently.
 */
const connectionString = process.env.RELATIONSHIP_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const isolated = connectionString ? new URL(connectionString) : undefined;
if (enabled && isolated?.hostname === "localhost" && isolated.port === "5433" && isolated.pathname === "/dayli_test") {
  throw new Error("RELATIONSHIP_TEST_DATABASE_URL must not target the shared dayli_test database.");
}

const suite = enabled ? describe : describe.skip;

suite("Postgres relationship persistence", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/relationship_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/relationship_tests");
  const store = createHyperdriveRelationshipsStore({ connectionString: connectionString ?? "" });
  const directStore = createPostgresRelationshipsStore(database.db);
  const concurrentStore = createPostgresRelationshipsStore(concurrentDatabase.db);
  const service = createRelationshipsService(store, { now: () => new Date("2026-09-22T00:00:00.000Z") });
  const directService = createRelationshipsService(directStore);
  const messaging = createMessagingPersistenceServices(database.db);
  const concurrentMessaging = createMessagingPersistenceServices(concurrentDatabase.db);
  const users = Array.from({ length: 32 }, (_, index) => `relationship-test-${crypto.randomUUID()}-${index}`);

  beforeAll(async () => {
    await database.db.insert(schema.user).values(users.map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
    })));
  });

  afterAll(async () => {
    try {
      // Relationship foreign keys intentionally use NO ACTION. Remove child
      // projections before deleting fixture users, then always close the
      // request-scoped database even if cleanup reports a failure.
      await database.db.delete(schema.friendRequests).where(or(
        inArray(schema.friendRequests.senderId, users),
        inArray(schema.friendRequests.recipientId, users),
      ));
      await database.db.delete(schema.friendships).where(or(
        inArray(schema.friendships.userId, users),
        inArray(schema.friendships.friendId, users),
      ));
      await database.db.delete(schema.relationshipBlocks).where(or(
        inArray(schema.relationshipBlocks.blockerId, users),
        inArray(schema.relationshipBlocks.blockedId, users),
      ));
      await database.db.delete(schema.user).where(inArray(schema.user.id, users));
    } finally {
      await concurrentDatabase.close();
      await database.close();
    }
  });

  it("serializes reverse sends so exactly one pending request survives", async () => {
    const results = await Promise.allSettled([
      service.sendRequest(users[0]!, users[1]!),
      service.sendRequest(users[1]!, users[0]!),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [row] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.friendRequests)
      .where(and(
        eq(schema.friendRequests.status, "pending"),
        or(
          and(eq(schema.friendRequests.senderId, users[0]!), eq(schema.friendRequests.recipientId, users[1]!)),
          and(eq(schema.friendRequests.senderId, users[1]!), eq(schema.friendRequests.recipientId, users[0]!)),
        ),
      ));
    expect(row?.count).toBe(1);
  });

  it("persists paired friendship rows and block cleanup atomically", async () => {
    // Either reverse send may have won the previous race, so accept as
    // whichever fixture user actually received the surviving request.
    const [pending] = await database.db.select({
      id: schema.friendRequests.id,
      recipientId: schema.friendRequests.recipientId,
    }).from(schema.friendRequests).where(and(
      eq(schema.friendRequests.status, "pending"),
      or(
        and(eq(schema.friendRequests.senderId, users[0]!), eq(schema.friendRequests.recipientId, users[1]!)),
        and(eq(schema.friendRequests.senderId, users[1]!), eq(schema.friendRequests.recipientId, users[0]!)),
      ),
    ));
    const status = await service.acceptRequest(pending!.recipientId, pending!.id);
    expect(status.status).toBe("friends");

    const [friendshipRows] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.friendships)
      .where(or(
        and(eq(schema.friendships.userId, users[0]!), eq(schema.friendships.friendId, users[1]!)),
        and(eq(schema.friendships.userId, users[1]!), eq(schema.friendships.friendId, users[0]!)),
      ));
    expect(friendshipRows?.count).toBe(2);

    await service.block(users[0]!, users[1]!);
    const [afterBlock] = await database.db.select({
      pending: sql<number>`(select count(*) from ${schema.friendRequests} where ${schema.friendRequests.status} = 'pending' and (${schema.friendRequests.senderId} in (${users[0]!}, ${users[1]!}) or ${schema.friendRequests.recipientId} in (${users[0]!}, ${users[1]!})))::int`,
      active: sql<number>`(select count(*) from ${schema.friendships} where ${schema.friendships.state} = 'active' and ${schema.friendships.userId} in (${users[0]!}, ${users[1]!}) and ${schema.friendships.friendId} in (${users[0]!}, ${users[1]!}))::int`,
      blocks: sql<number>`(select count(*) from ${schema.relationshipBlocks} where ${schema.relationshipBlocks.blockerId} = ${users[0]!} and ${schema.relationshipBlocks.blockedId} = ${users[1]!} and ${schema.relationshipBlocks.unblockedAt} is null)::int`,
    }).from(sql`(values (1)) as query_source`);
    expect(afterBlock).toEqual({ pending: 0, active: 0, blocks: 1 });
  });

  it("serializes the production block mutation before a concurrent send", async () => {
    const blockerId = users[30]!;
    const blockedId = users[31]!;
    await database.db.insert(schema.friendships).values([
      { userId: blockerId, friendId: blockedId, state: "active", stateChangedAt: new Date() },
      { userId: blockedId, friendId: blockerId, state: "active", stateChangedAt: new Date() },
    ]);
    const conversation = await messaging.direct.create(blockerId, {
      recipientId: blockedId, clientMessageId: crypto.randomUUID(), text: "block contention",
    });
    const holder = createDayliDatabase(connectionString!);
    const inspector = createDayliDatabase(connectionString!);
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let locksHeld: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => { locksHeld = resolve; });
    const waitFor = async (condition: () => Promise<boolean>, message: string): Promise<void> => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await condition()) return;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      throw new Error(message);
    };
    try {
      const [holderBackend] = await holder.client`select pg_backend_pid() as pid`;
      const [blockerBackend] = await database.client`select pg_backend_pid() as pid`;
      const [senderBackend] = await concurrentDatabase.client`select pg_backend_pid() as pid`;
      const holderPid = Number(holderBackend?.pid);
      const blockerPid = Number(blockerBackend?.pid);
      const senderPid = Number(senderBackend?.pid);
      const holderTransaction = holder.client.begin(async (tx) => {
        await tx`select id from public."user" where id in (${blockerId}, ${blockedId}) order by id for update`;
        locksHeld?.();
        await held;
      });
      await locked;
      const blocking = directService.block(blockerId, blockedId);
      await waitFor(async () => {
        const [row] = await inspector.client`select ${holderPid} = any(pg_blocking_pids(${blockerPid})) as blocked`;
        return row?.blocked === true;
      }, "Expected production block mutation to wait for canonical user locks.");
      const sending = concurrentMessaging.send.send(blockerId, conversation.conversation.id, {
        clientMessageId: crypto.randomUUID(), text: "must observe production block",
      });
      await waitFor(async () => {
        const [row] = await inspector.client`
          select ${holderPid} = any(pg_blocking_pids(${senderPid}))
            or ${blockerPid} = any(pg_blocking_pids(${senderPid})) as blocked
        `;
        return row?.blocked === true;
      }, "Expected send to wait behind the production block mutation.");
      release!();
      await holderTransaction;
      await expect(blocking).resolves.toMatchObject({ status: "blocked" });
      await expect(sending).rejects.toMatchObject({ code: "BLOCKED" });
    } finally {
      release?.();
      await Promise.all([holder.close(), inspector.close()]);
    }
  });

  it("lists only minimal discoverable cards and omits private blocked and banned identities", async () => {
    const actor = users[6]!;
    const privateUser = users[4]!;
    const blockedUser = users[5]!;
    const bannedUser = users[3]!;
    const wildcardDecoy = users[2]!;
    await database.db.update(schema.user).set({
      username: sql`case ${schema.user.id} when ${privateUser} then 'bobby_private' when ${blockedUser} then 'bobby_blocked' when ${bannedUser} then 'bobby_banned' when ${wildcardDecoy} then 'bobbywild' end`,
      displayUsername: sql`case ${schema.user.id} when ${privateUser} then 'Bobby' else 'Hidden person' end`,
      profileVisibility: sql`case when ${schema.user.id} = ${privateUser} then 'private'::profile_visibility else ${schema.user.profileVisibility} end`,
      banned: sql`case when ${schema.user.id} = ${bannedUser} then true else ${schema.user.banned} end`,
    }).where(inArray(schema.user.id, [privateUser, blockedUser, bannedUser, wildcardDecoy]));
    await database.db.insert(schema.relationshipBlocks).values({ blockerId: actor, blockedId: blockedUser, blockedAt: new Date() });

    const page = await service.searchUsers(actor, 'bob', 20);

    expect(page.items.map((item) => item.username)).toEqual(['bobby_private', 'bobbywild']);
    expect(page.items[0]).toEqual({ id: privateUser, username: 'bobby_private', displayName: 'Bobby', relationship: 'none' });
    expect(Object.keys(page.items[0]!)).toEqual(['id', 'username', 'displayName', 'relationship']);
    await expect(service.searchUsers(actor, 'bobby_', 20)).resolves.toMatchObject({
      items: [{ id: privateUser, username: 'bobby_private' }],
    });
    for (let attempt = 0; attempt < 28; attempt += 1) await service.searchUsers(actor, 'bob', 20);
    await expect(service.searchUsers(actor, 'bob', 20)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it("returns private minimal profiles but hides them after blocks in either direction", async () => {
    const actor = users[8]!;
    const target = users[9]!;
    await database.db.update(schema.user).set({
      username: "private_profile_target",
      displayUsername: "Private Profile",
      profileVisibility: "private",
    }).where(eq(schema.user.id, target));

    await expect(service.getProfileByUsername(actor, "PRIVATE_PROFILE_TARGET")).resolves.toEqual({
      id: target,
      username: "private_profile_target",
      displayName: "Private Profile",
      relationship: "none",
    });

    await database.db.insert(schema.relationshipBlocks).values({ blockerId: target, blockedId: actor, blockedAt: new Date() });
    await expect(service.getProfileByUsername(actor, "private_profile_target")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await database.db.update(schema.relationshipBlocks).set({ unblockedAt: new Date() }).where(and(
      eq(schema.relationshipBlocks.blockerId, target),
      eq(schema.relationshipBlocks.blockedId, actor),
    ));

    await database.db.insert(schema.relationshipBlocks).values({ blockerId: actor, blockedId: target, blockedAt: new Date() });
    await expect(service.getProfileByUsername(actor, "private_profile_target")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never projects a provider-owned name and retains an explicit public name", async () => {
    const actor = users[7]!;
    const providerUser = users[8]!;
    await database.db.update(schema.user).set({
      username: sql`case ${schema.user.id} when ${actor} then 'projection_actor' else 'provider_handle' end`,
      name: sql`case ${schema.user.id} when ${actor} then 'Actor Provider Name' else 'Google Provider Name' end`,
      displayUsername: null,
    }).where(inArray(schema.user.id, [actor, providerUser]));
    await database.db.insert(schema.friendships).values([
      { userId: actor, friendId: providerUser, state: "active", stateChangedAt: new Date() },
      { userId: providerUser, friendId: actor, state: "active", stateChangedAt: new Date() },
    ]);

    await expect(service.listFriends(actor, 20)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: providerUser, username: 'provider_handle', displayName: 'provider_handle' })],
    });

    await database.db.update(schema.user).set({ displayUsername: "Chosen Public Name" }).where(eq(schema.user.id, providerUser));
    await expect(service.listFriends(actor, 20)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: providerUser, displayName: 'Chosen Public Name' })],
    });
  });

  it("paginates pending requests with qualified, microsecond-precise request cursors", async () => {
    const actor = users[6]!;
    const first = users[0]!;
    const second = users[1]!;
    await database.db.update(schema.user).set({
      username: sql`case ${schema.user.id} when ${first} then 'request_first' when ${second} then 'request_second' end`,
    }).where(inArray(schema.user.id, [first, second]));
    await database.db.insert(schema.friendRequests).values([
      { id: "request-page-1", senderId: actor, recipientId: first, status: "pending", createdAt: sql`'2026-09-22T00:00:00.000001Z'::timestamptz` },
      { id: "request-page-2", senderId: actor, recipientId: second, status: "pending", createdAt: sql`'2026-09-22T00:00:00.000002Z'::timestamptz` },
    ]);

    const firstPage = await service.listPendingRequests(actor, 'outgoing', 1);
    const secondPage = await service.listPendingRequests(actor, 'outgoing', 1, firstPage.nextCursor ?? undefined);

    expect(firstPage.items.map((item) => item.id)).toEqual(['request-page-1']);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items.map((item) => item.id)).toEqual(['request-page-2']);
    expect(secondPage.hasMore).toBe(false);
  });

  it("keeps request cursor microseconds and ID tie-breaks while excluding blocked identities", async () => {
    const actor = users[9]!;
    const first = users[10]!;
    const second = users[11]!;
    const blocked = users[12]!;
    await database.db.update(schema.user).set({
      username: sql`case ${schema.user.id} when ${first} then 'request_cursor_first' when ${second} then 'request_cursor_second' when ${blocked} then 'request_cursor_blocked' end`,
    }).where(inArray(schema.user.id, [first, second, blocked]));
    await database.db.insert(schema.friendRequests).values([
      { id: "request-cursor-a", senderId: actor, recipientId: first, status: "pending", createdAt: sql`'2026-09-22T00:00:00.000001Z'::timestamptz` },
      { id: "request-cursor-b", senderId: actor, recipientId: second, status: "pending", createdAt: sql`'2026-09-22T00:00:00.000001Z'::timestamptz` },
      { id: "request-cursor-blocked", senderId: actor, recipientId: blocked, status: "pending", createdAt: sql`'2026-09-22T00:00:00.000001Z'::timestamptz` },
    ]);
    await database.db.insert(schema.relationshipBlocks).values({ blockerId: actor, blockedId: blocked, blockedAt: new Date() });

    const firstPage = await service.listPendingRequests(actor, 'outgoing', 1);
    const secondPage = await service.listPendingRequests(actor, 'outgoing', 1, firstPage.nextCursor ?? undefined);

    expect(firstPage.items.map((item) => item.id)).toEqual(['request-cursor-a']);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items.map((item) => item.id)).toEqual(['request-cursor-b']);
    expect(secondPage.hasMore).toBe(false);
  });

  it("paginates reciprocal friends while excluding blocked and banned accounts", async () => {
    const actor = users[13]!;
    const first = users[14]!;
    const second = users[15]!;
    const blocked = users[16]!;
    const banned = users[17]!;
    await database.db.update(schema.user).set({
      username: sql`case ${schema.user.id} when ${first} then 'friend_cursor_a' when ${second} then 'friend_cursor_b' when ${blocked} then 'blocked_friend' when ${banned} then 'banned_friend' end`,
      banned: sql`${schema.user.id} = ${banned}`,
    }).where(inArray(schema.user.id, [first, second, blocked, banned]));
    const stateChangedAt = new Date();
    await database.db.insert(schema.friendships).values([
      { userId: actor, friendId: first, state: "active", stateChangedAt },
      { userId: first, friendId: actor, state: "active", stateChangedAt },
      { userId: actor, friendId: second, state: "active", stateChangedAt },
      { userId: second, friendId: actor, state: "active", stateChangedAt },
      { userId: actor, friendId: blocked, state: "active", stateChangedAt },
      { userId: blocked, friendId: actor, state: "active", stateChangedAt },
      { userId: actor, friendId: banned, state: "active", stateChangedAt },
      { userId: banned, friendId: actor, state: "active", stateChangedAt },
    ]);
    await database.db.insert(schema.relationshipBlocks).values({ blockerId: actor, blockedId: blocked, blockedAt: new Date() });

    const firstPage = await service.listFriends(actor, 1);
    const secondPage = await service.listFriends(actor, 1, firstPage.nextCursor ?? undefined);

    expect(firstPage.items.map((item) => item.id)).toEqual([first]);
    expect(firstPage.hasMore).toBe(true);
    expect(secondPage.items.map((item) => item.id)).toEqual([second]);
    expect(secondPage.hasMore).toBe(false);
  });

  it("holds the canonical pair lock through rollback and releases it afterwards", async () => {
    const sender = users[18]!;
    const recipient = users[19]!;
    const rollback = new Error("rollback relationship lock holder");
    let releaseLock: (() => void) | undefined;
    let signalLocked: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const holder = directStore.withTransaction(async (transaction) => {
      await transaction.sendRequest({ senderId: sender, recipientId: recipient, createdAt: "2026-09-22T00:00:00.000Z" });
      signalLocked!();
      await release;
      throw rollback;
    });

    await locked;
    try {
      await concurrentDatabase.db.execute(sql`set lock_timeout = '100ms'`);
      await expect(concurrentStore.withTransaction((transaction) => transaction.sendRequest({
        senderId: recipient,
        recipientId: sender,
        createdAt: "2026-09-22T00:00:00.000Z",
      }))).rejects.toMatchObject({ cause: { code: "55P03" } });
    } finally {
      releaseLock!();
    }
    await expect(holder).rejects.toBe(rollback);
    await concurrentDatabase.db.execute(sql`set lock_timeout = '0'`);

    await expect(concurrentStore.withTransaction((transaction) => transaction.sendRequest({
      senderId: recipient,
      recipientId: sender,
      createdAt: "2026-09-22T00:00:00.000Z",
    }))).resolves.toMatchObject({ requests: { outgoing: { senderId: recipient, recipientId: sender } } });
    const [requests] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.friendRequests)
      .where(or(
        and(eq(schema.friendRequests.senderId, sender), eq(schema.friendRequests.recipientId, recipient)),
        and(eq(schema.friendRequests.senderId, recipient), eq(schema.friendRequests.recipientId, sender)),
      ));
    expect(requests?.count).toBe(1);
  });

  it("keeps block and unblock transitions idempotent", async () => {
    const blocker = users[20]!;
    const blocked = users[21]!;

    await expect(service.block(blocker, blocked)).resolves.toMatchObject({ status: "blocked" });
    await expect(service.block(blocker, blocked)).resolves.toMatchObject({ status: "blocked" });
    const [activeBlock] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.relationshipBlocks)
      .where(and(
        eq(schema.relationshipBlocks.blockerId, blocker),
        eq(schema.relationshipBlocks.blockedId, blocked),
        isNull(schema.relationshipBlocks.unblockedAt),
      ));
    expect(activeBlock?.count).toBe(1);

    await expect(service.unblock(blocker, blocked)).resolves.toMatchObject({ status: "none" });
    await expect(service.unblock(blocker, blocked)).resolves.toMatchObject({ status: "none" });
    const [remainingBlock] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.relationshipBlocks)
      .where(and(
        eq(schema.relationshipBlocks.blockerId, blocker),
        eq(schema.relationshipBlocks.blockedId, blocked),
        isNull(schema.relationshipBlocks.unblockedAt),
      ));
    expect(remainingBlock?.count).toBe(0);
  });

  it("serializes an accept and block race without leaving an active relationship", async () => {
    const sender = users[25]!;
    const recipient = users[26]!;
    const sent = await service.sendRequest(sender, recipient);

    const [, block] = await Promise.allSettled([
      service.acceptRequest(recipient, sent.outgoingRequest!.id),
      service.block(recipient, sender),
    ]);

    expect(block).toMatchObject({ status: "fulfilled", value: { status: "blocked" } });
    const [state] = await database.db.select({
      pending: sql<number>`(select count(*) from ${schema.friendRequests} where ${schema.friendRequests.status} = 'pending' and ${schema.friendRequests.senderId} = ${sender} and ${schema.friendRequests.recipientId} = ${recipient})::int`,
      active: sql<number>`(select count(*) from ${schema.friendships} where ${schema.friendships.state} = 'active' and ((${schema.friendships.userId} = ${sender} and ${schema.friendships.friendId} = ${recipient}) or (${schema.friendships.userId} = ${recipient} and ${schema.friendships.friendId} = ${sender})))::int`,
      blocks: sql<number>`(select count(*) from ${schema.relationshipBlocks} where ${schema.relationshipBlocks.blockerId} = ${recipient} and ${schema.relationshipBlocks.blockedId} = ${sender} and ${schema.relationshipBlocks.unblockedAt} is null)::int`,
    }).from(sql`(values (1)) as query_source`);
    expect(state).toEqual({ pending: 0, active: 0, blocks: 1 });
  });

  it("does not let another actor unblock a relationship block", async () => {
    const blocker = users[27]!;
    const blocked = users[28]!;
    const stranger = users[29]!;
    await service.block(blocker, blocked);

    await expect(service.unblock(stranger, blocked)).resolves.toMatchObject({ status: "none" });
    const [activeBlock] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.relationshipBlocks)
      .where(and(
        eq(schema.relationshipBlocks.blockerId, blocker),
        eq(schema.relationshipBlocks.blockedId, blocked),
        isNull(schema.relationshipBlocks.unblockedAt),
      ));
    expect(activeBlock?.count).toBe(1);
  });

  it("conceals requests from a wrong actor and blocks relationship reads in either direction", async () => {
    const sender = users[22]!;
    const recipient = users[23]!;
    const stranger = users[24]!;
    const sent = await service.sendRequest(sender, recipient);

    await expect(service.acceptRequest(stranger, sent.outgoingRequest!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [pending] = await database.db.select({ status: schema.friendRequests.status })
      .from(schema.friendRequests)
      .where(eq(schema.friendRequests.id, sent.outgoingRequest!.id));
    expect(pending?.status).toBe("pending");

    await service.block(recipient, sender);
    await expect(service.getStatus(sender, recipient)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.getStatus(recipient, sender)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("fails closed for legacy case-folded username collisions and resolves a unique handle", async () => {
    const actor = users[7]!;
    const first = users[0]!;
    const second = users[1]!;
    // Reproduce pre-migration case collisions without weakening the live rule.
    // The table lock stays held until the trigger is re-enabled and committed,
    // so other test connections cannot write while the trigger is disabled.
    await database.db.transaction(async (transaction) => {
      // DDL is required to reproduce legacy collisions while the lock prevents concurrent writes.
      await transaction.execute(sql`alter table public."user" disable trigger enforce_case_insensitive_username`);
      await transaction.update(schema.user).set({
        username: sql`case ${schema.user.id} when ${first} then 'Collision' when ${second} then 'collision' when ${actor} then 'profile_actor' end`,
      }).where(inArray(schema.user.id, [actor, first, second]));
      await transaction.execute(sql`alter table public."user" enable trigger enforce_case_insensitive_username`);
    });
    await expect(service.getProfileByUsername(actor, 'COLLISION')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await database.db.update(schema.user).set({ username: null }).where(eq(schema.user.id, second));
    await expect(service.getProfileByUsername(actor, 'collision')).resolves.toEqual({ id: first, username: 'Collision', displayName: 'Collision', relationship: 'none' });
  });

  it("enforces five sends in a rolling 24-hour window", async () => {
    for (let index = 0; index < 5; index += 1) {
      const result = await service.sendRequest(users[2]!, users[3]!);
      expect(result.status).toBe("outgoing_pending");
      if (index % 2 === 0) {
        await service.cancelRequest(users[2]!, result.outgoingRequest!.id);
      } else {
        await service.declineRequest(users[3]!, result.outgoingRequest!.id);
      }
    }

    await expect(service.sendRequest(users[2]!, users[3]!)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(service.sendRequest(users[2]!, users[4]!)).resolves.toMatchObject({ status: "outgoing_pending" });

    const [history] = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(schema.friendRequests)
      .where(and(
        eq(schema.friendRequests.senderId, users[2]!),
        eq(schema.friendRequests.recipientId, users[3]!),
      ));
    expect(history?.count).toBe(5);
  });
});

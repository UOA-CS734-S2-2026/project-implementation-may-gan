import { createDayliDatabase, sql } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRelationshipsService } from "../../../app";
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
  const users = Array.from({ length: 30 }, (_, index) => `relationship-test-${crypto.randomUUID()}-${index}`);

  beforeAll(async () => {
    await database.client`
      insert into public."user" (id, name, email)
      select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)
    `;
  });

  afterAll(async () => {
    try {
      // Relationship foreign keys intentionally use NO ACTION. Remove child
      // projections before deleting fixture users, then always close the
      // request-scoped database even if cleanup reports a failure.
      await database.client`delete from public.friend_requests where sender_id = any(${users}::text[]) or recipient_id = any(${users}::text[])`;
      await database.client`delete from public.friendships where user_id = any(${users}::text[]) or friend_id = any(${users}::text[])`;
      await database.client`delete from public.relationship_blocks where blocker_id = any(${users}::text[]) or blocked_id = any(${users}::text[])`;
      await database.client`delete from public."user" where id = any(${users}::text[])`;
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
    const [row] = await database.client`
      select count(*)::int as count from public.friend_requests
      where status = 'pending' and ((sender_id = ${users[0]!} and recipient_id = ${users[1]!})
        or (sender_id = ${users[1]!} and recipient_id = ${users[0]!}))
    `;
    expect(row?.count).toBe(1);
  });

  it("persists paired friendship rows and block cleanup atomically", async () => {
    // Either reverse send may have won the previous race, so accept as
    // whichever fixture user actually received the surviving request.
    const [pending] = await database.client`
      select id, recipient_id from public.friend_requests
      where status = 'pending' and ((sender_id = ${users[0]!} and recipient_id = ${users[1]!})
        or (sender_id = ${users[1]!} and recipient_id = ${users[0]!}))
    `;
    const status = await service.acceptRequest(pending!.recipient_id as string, pending!.id as string);
    expect(status.status).toBe("friends");

    const [friendshipRows] = await database.client`
      select count(*)::int as count from public.friendships
      where (user_id = ${users[0]!} and friend_id = ${users[1]!})
         or (user_id = ${users[1]!} and friend_id = ${users[0]!})
    `;
    expect(friendshipRows?.count).toBe(2);

    await service.block(users[0]!, users[1]!);
    const [afterBlock] = await database.client`
      select
        (select count(*) from public.friend_requests where status = 'pending' and (sender_id = any(${users.slice(0, 2)}::text[]) or recipient_id = any(${users.slice(0, 2)}::text[])))::int as pending,
        (select count(*) from public.friendships where state = 'active' and user_id = any(${users.slice(0, 2)}::text[]) and friend_id = any(${users.slice(0, 2)}::text[]))::int as active,
        (select count(*) from public.relationship_blocks where blocker_id = ${users[0]!} and blocked_id = ${users[1]!} and unblocked_at is null)::int as blocks
    `;
    expect(afterBlock).toEqual({ pending: 0, active: 0, blocks: 1 });
  });

  it("lists only minimal discoverable cards and omits private blocked and banned identities", async () => {
    const actor = users[6]!;
    const privateUser = users[4]!;
    const blockedUser = users[5]!;
    const bannedUser = users[3]!;
    const wildcardDecoy = users[2]!;
    await database.client`
      update public."user" set username = case id
        when ${privateUser} then 'bobby_private'
        when ${blockedUser} then 'bobby_blocked'
        when ${bannedUser} then 'bobby_banned'
        when ${wildcardDecoy} then 'bobbywild'
      end,
      display_username = case id when ${privateUser} then 'Bobby' else 'Hidden person' end,
      profile_visibility = case when id = ${privateUser} then 'private'::profile_visibility else profile_visibility end,
      banned = case when id = ${bannedUser} then true else banned end
      where id = any(${[privateUser, blockedUser, bannedUser, wildcardDecoy]}::text[])
    `;
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${actor}, ${blockedUser}, now())`;

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

  it("never projects a provider-owned name and retains an explicit public name", async () => {
    const actor = users[7]!;
    const providerUser = users[8]!;
    await database.client`
      update public."user"
      set username = case id when ${actor} then 'projection_actor' else 'provider_handle' end,
          name = case id when ${actor} then 'Actor Provider Name' else 'Google Provider Name' end,
          display_username = null
      where id = any(${[actor, providerUser]}::text[])
    `;
    await database.client`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${actor}, ${providerUser}, 'active', now()), (${providerUser}, ${actor}, 'active', now())
    `;

    await expect(service.listFriends(actor, 20)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: providerUser, username: 'provider_handle', displayName: 'provider_handle' })],
    });

    await database.client`update public."user" set display_username = 'Chosen Public Name' where id = ${providerUser}`;
    await expect(service.listFriends(actor, 20)).resolves.toMatchObject({
      items: [expect.objectContaining({ id: providerUser, displayName: 'Chosen Public Name' })],
    });
  });

  it("paginates pending requests with qualified, microsecond-precise request cursors", async () => {
    const actor = users[6]!;
    const first = users[0]!;
    const second = users[1]!;
    await database.client`
      update public."user" set username = case id when ${first} then 'request_first' when ${second} then 'request_second' end
      where id = any(${[first, second]}::text[])
    `;
    await database.client`
      insert into public.friend_requests (id, sender_id, recipient_id, status, created_at)
      values ('request-page-1', ${actor}, ${first}, 'pending', '2026-09-22T00:00:00.000001Z'),
             ('request-page-2', ${actor}, ${second}, 'pending', '2026-09-22T00:00:00.000002Z')
    `;

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
    await database.client`
      update public."user" set username = case id
        when ${first} then 'request_cursor_first'
        when ${second} then 'request_cursor_second'
        when ${blocked} then 'request_cursor_blocked'
      end
      where id = any(${[first, second, blocked]}::text[])
    `;
    await database.client`
      insert into public.friend_requests (id, sender_id, recipient_id, status, created_at)
      values ('request-cursor-a', ${actor}, ${first}, 'pending', '2026-09-22T00:00:00.000001Z'),
             ('request-cursor-b', ${actor}, ${second}, 'pending', '2026-09-22T00:00:00.000001Z'),
             ('request-cursor-blocked', ${actor}, ${blocked}, 'pending', '2026-09-22T00:00:00.000001Z')
    `;
    await database.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${actor}, ${blocked}, now())
    `;

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
    await database.client`
      update public."user" set username = case id
        when ${first} then 'friend_cursor_a'
        when ${second} then 'friend_cursor_b'
        when ${blocked} then 'blocked_friend'
        when ${banned} then 'banned_friend'
      end,
      banned = id = ${banned}
      where id = any(${[first, second, blocked, banned]}::text[])
    `;
    await database.client`
      insert into public.friendships (user_id, friend_id, state, state_changed_at)
      values (${actor}, ${first}, 'active', now()), (${first}, ${actor}, 'active', now()),
             (${actor}, ${second}, 'active', now()), (${second}, ${actor}, 'active', now()),
             (${actor}, ${blocked}, 'active', now()), (${blocked}, ${actor}, 'active', now()),
             (${actor}, ${banned}, 'active', now()), (${banned}, ${actor}, 'active', now())
    `;
    await database.client`
      insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at)
      values (${actor}, ${blocked}, now())
    `;

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
    const [requests] = await database.client`
      select count(*)::int as count from public.friend_requests
      where (sender_id = ${sender} and recipient_id = ${recipient})
         or (sender_id = ${recipient} and recipient_id = ${sender})
    `;
    expect(requests?.count).toBe(1);
  });

  it("keeps block and unblock transitions idempotent", async () => {
    const blocker = users[20]!;
    const blocked = users[21]!;

    await expect(service.block(blocker, blocked)).resolves.toMatchObject({ status: "blocked" });
    await expect(service.block(blocker, blocked)).resolves.toMatchObject({ status: "blocked" });
    const [activeBlock] = await database.client`
      select count(*)::int as count from public.relationship_blocks
      where blocker_id = ${blocker} and blocked_id = ${blocked} and unblocked_at is null
    `;
    expect(activeBlock?.count).toBe(1);

    await expect(service.unblock(blocker, blocked)).resolves.toMatchObject({ status: "none" });
    await expect(service.unblock(blocker, blocked)).resolves.toMatchObject({ status: "none" });
    const [remainingBlock] = await database.client`
      select count(*)::int as count from public.relationship_blocks
      where blocker_id = ${blocker} and blocked_id = ${blocked} and unblocked_at is null
    `;
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
    const [state] = await database.client`
      select
        (select count(*) from public.friend_requests where status = 'pending' and sender_id = ${sender} and recipient_id = ${recipient})::int as pending,
        (select count(*) from public.friendships where state = 'active' and ((user_id = ${sender} and friend_id = ${recipient}) or (user_id = ${recipient} and friend_id = ${sender})))::int as active,
        (select count(*) from public.relationship_blocks where blocker_id = ${recipient} and blocked_id = ${sender} and unblocked_at is null)::int as blocks
    `;
    expect(state).toEqual({ pending: 0, active: 0, blocks: 1 });
  });

  it("does not let another actor unblock a relationship block", async () => {
    const blocker = users[27]!;
    const blocked = users[28]!;
    const stranger = users[29]!;
    await service.block(blocker, blocked);

    await expect(service.unblock(stranger, blocked)).resolves.toMatchObject({ status: "none" });
    const [activeBlock] = await database.client`
      select count(*)::int as count from public.relationship_blocks
      where blocker_id = ${blocker} and blocked_id = ${blocked} and unblocked_at is null
    `;
    expect(activeBlock?.count).toBe(1);
  });

  it("conceals requests from a wrong actor and blocks relationship reads in either direction", async () => {
    const sender = users[22]!;
    const recipient = users[23]!;
    const stranger = users[24]!;
    const sent = await service.sendRequest(sender, recipient);

    await expect(service.acceptRequest(stranger, sent.outgoingRequest!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [pending] = await database.client`
      select status from public.friend_requests where id = ${sent.outgoingRequest!.id}
    `;
    expect(pending?.status).toBe("pending");

    await service.block(recipient, sender);
    await expect(service.getStatus(sender, recipient)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.getStatus(recipient, sender)).rejects.toMatchObject({ code: "NOT_FOUND" });
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

    const [history] = await database.client`
      select count(*)::int as count
      from public.friend_requests
      where sender_id = ${users[2]!} and recipient_id = ${users[3]!}
    `;
    expect(history?.count).toBe(5);
  });
});

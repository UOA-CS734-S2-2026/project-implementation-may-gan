import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHyperdriveRelationshipsStore } from "./relationships.repository";
import { createRelationshipsService } from "../../../../test/relationships-service";

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
  const store = createHyperdriveRelationshipsStore({ connectionString: connectionString ?? "" });
  const service = createRelationshipsService(store, { now: () => new Date("2026-09-22T00:00:00.000Z") });
  const users = Array.from({ length: 7 }, (_, index) => `relationship-test-${crypto.randomUUID()}-${index}`);

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

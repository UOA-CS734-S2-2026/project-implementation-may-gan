import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHyperdriveRelationshipsStore } from "./postgres-store";
import { createRelationshipsService } from "./service";

/**
 * These tests must use a disposable database containing migration 0005.
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
    await database.client`delete from public."user" where id = any(${users}::text[])`;
    await database.close();
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
    const status = await service.acceptRequest(users[1]!, (await database.client`
      select id from public.friend_requests where status = 'pending' limit 1
    `)[0]!.id as string);
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

  it("enforces five sends in a rolling 24-hour window", async () => {
    for (let index = 0; index < 5; index += 1) {
      const recipient = users[index + 2]!;
      const result = await service.sendRequest(users[0]!, recipient);
      expect(result.status).toBe("outgoing_pending");
      await service.cancelRequest(users[0]!, result.outgoingRequest!.id);
    }

    await expect(service.sendRequest(users[0]!, users[1]!)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

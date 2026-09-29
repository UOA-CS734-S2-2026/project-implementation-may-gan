import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../app";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("messaging direct conversation Postgres persistence", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 8 }, (_, index) => `messaging-${crypto.randomUUID()}-${index}`);
  const { direct, reader, send, set: setReaction, remove: removeReaction } = createMessagingPersistenceServices(database.db);
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const { direct: concurrentDirect } = createMessagingPersistenceServices(concurrentDatabase.db);

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
  });
  afterAll(async () => {
    try {
      await database.client`delete from public.relationship_blocks where blocker_id = any(${users}::text[]) or blocked_id = any(${users}::text[])`;
      await database.client`delete from public.friendships where user_id = any(${users}::text[]) or friend_id = any(${users}::text[])`;
      await database.client`delete from public.friend_requests where sender_id = any(${users}::text[]) or recipient_id = any(${users}::text[])`;
      await database.client`delete from public."user" where id = any(${users}::text[])`;
    } finally { await concurrentDatabase.close(); await database.close(); }
  });

  it("serializes concurrent direct creation, persists its request and keeps the idempotent initial message singular", async () => {
    const clientMessageId = crypto.randomUUID();
    const results = await Promise.all([
      direct.create(users[0]!, { recipientId: users[1]!, clientMessageId, text: "hello" }),
      concurrentDirect.create(users[0]!, { recipientId: users[1]!, clientMessageId, text: "hello" }),
    ]);
    expect(new Set(results.map((result) => result.conversation.id)).size).toBe(1);
    expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
    const requests = await reader.list(users[1]!, "requests", undefined, 30);
    expect(requests.items).toHaveLength(1);
    const [count] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${results[0]!.conversation.id}`;
    expect(count?.count).toBe(2);
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now())`;
    const activated = await direct.create(users[0]!, { recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "friendship activated" });
    expect(activated.conversation.requestState).toBe("active");
  });

  it("uses an exact database timestamp cursor so same-second inbox entries are not omitted", async () => {
    const now = new Date("2026-09-28T06:00:00.123Z");
    const { direct: service } = createMessagingPersistenceServices(database.db, { now: () => now });
    for (const peer of users.slice(5, 8)) {
      await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[4]!}, ${peer}, 'active', now()), (${peer}, ${users[4]!}, 'active', now())`;
      await service.create(users[4]!, { recipientId: peer, clientMessageId: crypto.randomUUID(), text: "same timestamp" });
    }
    const first = await reader.list(users[4]!, "inbox", undefined, 1);
    const second = await reader.list(users[4]!, "inbox", first.nextCursor ?? undefined, 1);
    const third = await reader.list(users[4]!, "inbox", second.nextCursor ?? undefined, 1);
    const ids = [...first.items, ...second.items, ...third.items].map((item) => (item as { id: string }).id);
    expect(new Set(ids)).toHaveLength(3);
  });

  it("accepts the pending request, writes active history and advances only the recipient read cursor", async () => {
    const created = await direct.create(users[0]!, { recipientId: users[2]!, clientMessageId: crypto.randomUUID(), text: "request" });
    const accepted = await reader.resolve(users[2]!, created.conversation.id, "accept");
    expect((accepted as { requestState: string }).requestState).toBe("active");
    const second = await send.send(users[0]!, created.conversation.id, { clientMessageId: crypto.randomUUID(), text: "after accept" });
    expect(second.message.sequence).toBe("2");
    const history = await reader.messages(users[2]!, created.conversation.id, undefined, undefined, 50);
    expect(history.items.map((item) => item.sequence)).toEqual(["1", "2"]);
    const before = await reader.unread(users[2]!);
    expect(before.inboxCount).toBe(2);
    const read = await reader.markRead(users[2]!, created.conversation.id, "2");
    expect(read.lastReadSequence).toBe("2");
    expect(read.receiptSequence).toBe("2");
    expect(read.unreadCount).toBe(0);
    const changes = await reader.changes(users[2]!, created.conversation.id, undefined, 50) as { items: Array<{ kind: string }> };
    expect(changes.items.map((item) => item.kind)).toContain("read.updated");
    const beforeOutbox = (await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`)[0]!.count as number;
    await expect(setReaction.set(users[2]!, created.conversation.id, second.message.id, "love")).resolves.toMatchObject({ changed: true });
    await expect(setReaction.set(users[2]!, created.conversation.id, second.message.id, "love")).resolves.toMatchObject({ changed: false });
    const afterRepeatedSet = (await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`)[0]!.count as number;
    expect(afterRepeatedSet).toBe(beforeOutbox + 2);
    await expect(removeReaction.remove(users[2]!, created.conversation.id, second.message.id)).resolves.toMatchObject({ changed: true });
    await expect(removeReaction.remove(users[2]!, created.conversation.id, second.message.id)).resolves.toMatchObject({ changed: false });
    const afterRepeatedRemove = (await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`)[0]!.count as number;
    expect(afterRepeatedRemove).toBe(afterRepeatedSet + 2);
  });

  it("declines a request and treats the recipient's same decision retry as idempotent", async () => {
    const created = await direct.create(users[1]!, { recipientId: users[2]!, clientMessageId: crypto.randomUUID(), text: "decline me" });
    const first = await reader.resolve(users[2]!, created.conversation.id, "decline") as { requestState: string };
    const replay = await reader.resolve(users[2]!, created.conversation.id, "decline") as { requestState: string };
    expect(first.requestState).toBe("declined");
    expect(replay.requestState).toBe("declined");
    await expect(send.send(users[1]!, created.conversation.id, { clientMessageId: crypto.randomUUID(), text: "not allowed" })).rejects.toMatchObject({ code: "DECLINED" });
  });

  it("rejects creation and peer-visible reads after either-direction blocks", async () => {
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[1]!}, ${users[0]!}, now())`;
    await expect(direct.create(users[0]!, { recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "blocked" })).rejects.toMatchObject({ code: "BLOCKED" });
    const pending = await direct.create(users[0]!, { recipientId: users[3]!, clientMessageId: crypto.randomUUID(), text: "another request" });
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[3]!}, ${users[0]!}, now())`;
    const result = await reader.markRead(users[3]!, pending.conversation.id, "1");
    expect(result.receiptSequence).toBe("0");
  });
});

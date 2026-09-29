import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("create direct conversation Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 8 }, (_, index) => `create-direct-conversation-${crypto.randomUUID()}-${index}`);
  const { direct } = createMessagingPersistenceServices(database.db);
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
    } finally {
      await concurrentDatabase.close();
      await database.close();
    }
  });

  it("serializes concurrent creation into one atomic conversation, initial message, members, change and realtime outbox", async () => {
    const clientMessageId = crypto.randomUUID();
    const results = await Promise.all([
      direct.create(users[0]!, { recipientId: users[1]!, clientMessageId, text: "hello" }),
      concurrentDirect.create(users[0]!, { recipientId: users[1]!, clientMessageId, text: "hello" }),
    ]);
    const conversationId = results[0]!.conversation.id;

    expect(new Set(results.map((result) => result.conversation.id))).toEqual(new Set([conversationId]));
    expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    const [messages] = await database.client`select count(*)::int as count from public.messages where conversation_id = ${conversationId}`;
    const [members] = await database.client`select count(*)::int as count from public.conversation_members where conversation_id = ${conversationId}`;
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversationId} and kind = 'message.created'`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversationId} and channel = 'realtime'`;
    expect(messages?.count).toBe(1);
    expect(members?.count).toBe(2);
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(2);

    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now())`;
    const activated = await direct.create(users[0]!, { recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "friendship activated" });
    expect(activated.conversation.requestState).toBe("active");
  });

  it("replays an identical initial request without duplicate persistence or outbox work", async () => {
    const clientMessageId = crypto.randomUUID();
    const created = await direct.create(users[2]!, { recipientId: users[3]!, clientMessageId, text: "replay me" });
    const replayed = await direct.create(users[2]!, { recipientId: users[3]!, clientMessageId, text: "replay me" });

    expect(replayed).toMatchObject({ conversation: { id: created.conversation.id }, message: { id: created.message.id }, replayed: true });
    const [messages] = await database.client`select count(*)::int as count from public.messages where conversation_id = ${created.conversation.id}`;
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id}`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`;
    expect(messages?.count).toBe(1);
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(2);
  });

  it("rejects creation after either-direction blocks", async () => {
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[5]!}, ${users[4]!}, now())`;
    await expect(direct.create(users[4]!, { recipientId: users[5]!, clientMessageId: crypto.randomUUID(), text: "blocked" })).rejects.toMatchObject({ code: "BLOCKED" });
  });
});

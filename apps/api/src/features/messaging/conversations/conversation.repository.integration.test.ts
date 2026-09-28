import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCreateDirectConversationService } from "./create-direct-conversation/create-direct-conversation.service";
import { createPostgresConversationReader, createPostgresDirectConversationStore } from "./conversation.repository";
import { createPostgresMessageWriteStore } from "../messages/send-message/send-message.repository";
import { createSendMessageService } from "../messages/send-message/send-message.service";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("messaging direct conversation Postgres persistence", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 4 }, (_, index) => `messaging-${crypto.randomUUID()}-${index}`);
  const direct = createCreateDirectConversationService({ store: createPostgresDirectConversationStore(database.db) });
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDirect = createCreateDirectConversationService({ store: createPostgresDirectConversationStore(concurrentDatabase.db) });
  const reader = createPostgresConversationReader(database.db);
  const send = createSendMessageService({ store: createPostgresMessageWriteStore(database.db) });

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

import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendConversationChange } from "../append-conversation-change";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("conversation change builders", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = [
    `append-change-a-${crypto.randomUUID()}`,
    `append-change-b-${crypto.randomUUID()}`,
  ];

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${users}::text[])`;
    } finally {
      await database.close();
    }
  });

  async function createConversation() {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = new Date("2026-09-30T00:00:00.000Z");
    await database.client`delete from public.conversations where participant_low_id = ${users[0]!} and participant_high_id = ${users[1]!}`;
    await database.client`insert into public.conversations (id, kind, participant_low_id, participant_high_id, initiator_participant_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${conversationId}, 'direct', ${users[0]!}, ${users[1]!}, ${users[0]!}, 'active', 1, 0, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)`;
    await database.client`insert into public.messages (id, conversation_id, sequence, sender_participant_id, client_message_id, request_fingerprint, body, version, created_at) values (${messageId}, ${conversationId}, 1, ${users[0]!}, ${crypto.randomUUID()}, ${crypto.randomUUID()}, 'message', 1, ${now.toISOString()}::timestamptz)`;
    return { conversationId, messageId, now };
  }

  it("rolls back every append write when its caller rolls back", async () => {
    const { conversationId } = await createConversation();
    await expect(database.db.transaction(async (transaction) => {
      await appendConversationChange(transaction, conversationId, "read.updated", null, users[0]!, new Date());
      transaction.rollback();
    })).rejects.toBeDefined();

    const [conversation] = await database.client`select last_change_sequence from public.conversations where id = ${conversationId}`;
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversationId}`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversationId}`;
    expect(String(conversation?.last_change_sequence)).toBe("0");
    expect(changes?.count).toBe(0);
    expect(outbox?.count).toBe(0);
  });

  it("rejects an unsafe allocated change sequence before writing changes or outbox work", async () => {
    const { conversationId, messageId, now } = await createConversation();
    await database.client`update public.conversations set last_change_sequence = 9007199254740992 where id = ${conversationId}`;

    await expect(database.db.transaction((transaction) => (
      appendConversationChange(transaction, conversationId, "message.created", messageId, null, now)
    ))).rejects.toThrow(RangeError);

    const [conversation] = await database.client`select last_change_sequence from public.conversations where id = ${conversationId}`;
    const [change] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${conversationId}`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${conversationId}`;
    expect(String(conversation?.last_change_sequence)).toBe("9007199254740992");
    expect(change?.count).toBe(0);
    expect(outbox?.count).toBe(0);
  });

});

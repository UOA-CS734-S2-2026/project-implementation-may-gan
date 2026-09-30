import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updateMessageRow } from "../update-message-row";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("message row update builders", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = [
    `update-message-a-${crypto.randomUUID()}`,
    `update-message-b-${crypto.randomUUID()}`,
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

  it("enforces CAS updates and removes reactions only for an explicit unsend", async () => {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = new Date("2026-09-30T00:00:00.000Z");
    await database.client`insert into public.conversations (id, kind, participant_low_id, participant_high_id, initiator_participant_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${conversationId}, 'direct', ${users[0]!}, ${users[1]!}, ${users[0]!}, 'active', 1, 0, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)`;
    await database.client`insert into public.messages (id, conversation_id, sequence, sender_participant_id, client_message_id, request_fingerprint, body, version, created_at) values (${messageId}, ${conversationId}, 1, ${users[0]!}, ${crypto.randomUUID()}, ${crypto.randomUUID()}, 'message', 1, ${now.toISOString()}::timestamptz)`;
    await database.client`insert into public.message_reactions (message_id, participant_id, reaction, created_at) values (${messageId}, ${users[1]!}, 'love', ${now.toISOString()}::timestamptz)`;

    await expect(updateMessageRow(database.db, {
      messageId,
      body: "edited",
      editedAt: now,
      expectedVersion: 1,
    })).resolves.toMatchObject({ body: "edited", version: 2 });
    await expect(updateMessageRow(database.db, {
      messageId,
      body: "stale",
      expectedVersion: 1,
    })).rejects.toThrow("Message write conflict.");
    const [retained] = await database.client`select count(*)::int as count from public.message_reactions where message_id = ${messageId}`;
    expect(retained?.count).toBe(1);

    await expect(updateMessageRow(database.db, {
      messageId,
      body: null,
      unsentAt: now,
    })).resolves.toMatchObject({ body: null, unsentAt: now, version: 3 });
    const [message] = await database.client`select body, unsent_at from public.messages where id = ${messageId}`;
    const [reactions] = await database.client`select count(*)::int as count from public.message_reactions where message_id = ${messageId}`;
    expect(message?.body).toBeNull();
    expect(message?.unsent_at).not.toBeNull();
    expect(reactions?.count).toBe(0);
  });
});

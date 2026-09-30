import { createDayliDatabase, schema } from "@dayli/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresResolveMessageRequestRepository } from "../resolve-message-request.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("resolve message request Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 13 }, (_, index) => `resolve-message-request-${crypto.randomUUID()}-${index}`);
  const { direct } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresResolveMessageRequestRepository(database.db);
  const concurrentRepository = createPostgresResolveMessageRequestRepository(concurrentDatabase.db);
  const builderQueries: string[] = [];
  const observedRepository = createPostgresResolveMessageRequestRepository(drizzle(database.client, {
    schema,
    logger: { logQuery(query) { builderQueries.push(query); } },
  }));

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

  it("accepts a pending request, persists its change and projects after commit", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "accept me",
    });

    await expect(repository.resolve(users[1]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
      capabilities: { canSend: true, canResolveRequest: false },
    });
    await expect(repository.resolve(users[1]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
    });
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id} and kind = 'request.active'`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`;
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(4);
  });

  it("uses native response reads at MAX_SAFE_INTEGER", async () => {
    const created = await direct.create(users[9]!, {
      recipientId: users[10]!,
      clientMessageId: crypto.randomUUID(),
      text: "high sequence",
    });
    const maximumSafeSequence = "9007199254740991";
    const previousSequence = "9007199254740990";
    await database.client`update public.messages set sequence = ${maximumSafeSequence}::bigint, version = ${maximumSafeSequence}::bigint where id = ${created.message.id}`;
    await database.client`update public.conversations set last_message_sequence = ${maximumSafeSequence}::bigint, last_change_sequence = ${previousSequence}::bigint where id = ${created.conversation.id}`;
    await database.client`
      update public.conversation_members
      set last_read_sequence = ${previousSequence}::bigint, receipt_sequence = ${previousSequence}::bigint
      where conversation_id = ${created.conversation.id} and user_id = ${users[10]!}
    `;

    builderQueries.length = 0;
    await expect(observedRepository.resolve(users[10]!, created.conversation.id, "accept")).resolves.toMatchObject({
      id: created.conversation.id,
      requestState: "active",
      latestMessage: { id: created.message.id, sequence: maximumSafeSequence, version: Number.MAX_SAFE_INTEGER },
      unreadCount: 1,
      lastMessageSequence: maximumSafeSequence,
      lastChangeSequence: maximumSafeSequence,
      lastReadSequence: previousSequence,
      receiptSequence: previousSequence,
    });
    expect(builderQueries).toHaveLength(12);
    const responseQueries = builderQueries.slice(-5);
    expect(responseQueries).toHaveLength(5);
    const latestQuery = responseQueries.find((query) => query.includes('order by "messages"."sequence" desc'));
    const unreadQuery = responseQueries.find((query) => query.includes("count(*)"));
    expect(latestQuery).toBeDefined();
    expect(latestQuery).not.toContain("::text");
    expect(unreadQuery).toBeDefined();
    expect(unreadQuery).not.toContain("::int");
    expect(unreadQuery).not.toContain("::bigint");
  });

  it("rolls back resolution state and outbox work when the change sequence overflows", async () => {
    const created = await direct.create(users[11]!, {
      recipientId: users[12]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflow resolution",
    });
    await database.client`update public.conversations set last_change_sequence = 9007199254740991 where id = ${created.conversation.id}`;

    await expect(repository.resolve(users[12]!, created.conversation.id, "accept"))
      .rejects.toThrow("Database sequence must be a safe nonnegative integer.");

    const [conversation] = await database.client`select request_state, last_change_sequence from public.conversations where id = ${created.conversation.id}`;
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id}`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`;
    expect(conversation).toMatchObject({ request_state: "pending" });
    expect(String(conversation?.last_change_sequence)).toBe("9007199254740991");
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(2);
  });

  it("declines once and treats the recipient retry as a no-op", async () => {
    const created = await direct.create(users[2]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "decline me",
    });

    await expect(repository.resolve(users[3]!, created.conversation.id, "decline")).resolves.toMatchObject({ requestState: "declined" });
    await expect(repository.resolve(users[3]!, created.conversation.id, "decline")).resolves.toMatchObject({ requestState: "declined" });
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id} and kind = 'request.declined'`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id}`;
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(4);
  });

  it("rejects blocked resolution without exposing a new change", async () => {
    const created = await direct.create(users[4]!, {
      recipientId: users[5]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked request",
    });
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[4]!}, ${users[5]!}, now())`;

    const resolutions = await Promise.allSettled([
      repository.resolve(users[5]!, created.conversation.id, "accept"),
      concurrentRepository.resolve(users[5]!, created.conversation.id, "accept"),
    ]);
    for (const resolution of resolutions) {
      expect(resolution).toMatchObject({ status: "rejected", reason: { code: "BLOCKED" } });
    }
    const [conversation] = await database.client`select request_state from public.conversations where id = ${created.conversation.id}`;
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id}`;
    expect(conversation).toMatchObject({ request_state: "pending" });
    expect(changes?.count).toBe(1);
  });

  it("keeps non-members private and forbids the request initiator", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "private request",
    });

    await expect(repository.resolve(users[8]!, created.conversation.id, "accept")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.resolve(users[0]!, created.conversation.id, "accept")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("serializes concurrent identical resolutions into one accepted change", async () => {
    const created = await direct.create(users[6]!, {
      recipientId: users[7]!,
      clientMessageId: crypto.randomUUID(),
      text: "race request",
    });

    await expect(Promise.all([
      repository.resolve(users[7]!, created.conversation.id, "accept"),
      concurrentRepository.resolve(users[7]!, created.conversation.id, "accept"),
    ])).resolves.toEqual([
      expect.objectContaining({ requestState: "active" }),
      expect.objectContaining({ requestState: "active" }),
    ]);
    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id} and kind = 'request.active'`;
    const [conversation] = await database.client`select request_state from public.conversations where id = ${created.conversation.id}`;
    expect(changes?.count).toBe(1);
    expect(conversation).toMatchObject({ request_state: "active" });
  });
});

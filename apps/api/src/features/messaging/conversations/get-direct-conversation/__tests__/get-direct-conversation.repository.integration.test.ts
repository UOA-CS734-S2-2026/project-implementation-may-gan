import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresGetDirectConversationRepository } from "../get-direct-conversation.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const target = connectionString ? new URL(connectionString) : undefined;
if (target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = connectionString ? describe : describe.skip;

suite("actor-owned direct pair lookup Postgres persistence", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 8 }, (_, index) => `direct-pair-${crypto.randomUUID()}-${index}`);
  const { direct, resolveMessageRequest } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresGetDirectConversationRepository(database.db);

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
      await database.close();
    }
  });

  it("finds active, outgoing, incoming and declined threads, but not unrelated or blocked pairs", async () => {
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now())`;
    const active = await direct.create(users[0]!, { recipientId: users[1]!, clientMessageId: crypto.randomUUID(), text: "active" });
    const pending = await direct.create(users[2]!, { recipientId: users[3]!, clientMessageId: crypto.randomUUID(), text: "pending" });
    const declined = await direct.create(users[4]!, { recipientId: users[5]!, clientMessageId: crypto.randomUUID(), text: "declined" });
    await resolveMessageRequest.resolve(users[5]!, declined.conversation.id, "decline");

    await expect(repository.find(users[0]!, users[1]!)).resolves.toEqual({ conversationId: active.conversation.id });
    await expect(repository.find(users[2]!, users[3]!)).resolves.toEqual({ conversationId: pending.conversation.id });
    await expect(repository.find(users[3]!, users[2]!)).resolves.toEqual({ conversationId: pending.conversation.id });
    await expect(repository.find(users[4]!, users[5]!)).resolves.toEqual({ conversationId: declined.conversation.id });
    await expect(repository.find(users[6]!, users[3]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repository.find(users[6]!, users[7]!)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[1]!}, ${users[0]!}, now())`;
    await expect(repository.find(users[0]!, users[1]!)).rejects.toMatchObject({ code: "BLOCKED" });
    await expect(repository.find(users[1]!, users[0]!)).rejects.toMatchObject({ code: "BLOCKED" });
  });
});

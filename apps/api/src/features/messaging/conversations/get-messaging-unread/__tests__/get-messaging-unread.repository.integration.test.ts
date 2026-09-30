import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresGetMessagingUnreadRepository } from "../get-messaging-unread.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("get messaging unread Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 6 }, (_, index) => `get-messaging-unread-${crypto.randomUUID()}-${index}`);
  const { direct, send } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresGetMessagingUnreadRepository(database.db);

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now()), (${users[4]!}, ${users[5]!}, 'active', now()), (${users[5]!}, ${users[4]!}, 'active', now())`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public.relationship_blocks where blocker_id = any(${users}::text[]) or blocked_id = any(${users}::text[])`;
      await database.client`delete from public.friendships where user_id = any(${users}::text[]) or friend_id = any(${users}::text[])`;
      await database.client`delete from public.friend_requests where sender_id = any(${users}::text[]) or recipient_id = any(${users}::text[])`;
      await database.client`delete from public.user where id = any(${users}::text[])`;
    } finally {
      await database.close();
    }
  });

  it("keeps actor-scoped inbox and incoming-request counts, including message-count duplicates", async () => {
    const active = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "active initial message",
    });
    await send.send(users[1]!, active.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "first unread active message",
    });
    await send.send(users[1]!, active.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "second unread active message",
    });
    await direct.create(users[2]!, {
      recipientId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      text: "incoming request",
    });
    await direct.create(users[0]!, {
      recipientId: users[3]!,
      clientMessageId: crypto.randomUUID(),
      text: "outgoing request",
    });

    const isolated = await direct.create(users[4]!, {
      recipientId: users[5]!,
      clientMessageId: crypto.randomUUID(),
      text: "isolated active initial message",
    });
    await send.send(users[5]!, isolated.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "isolated unread active message",
    });

    await expect(repository.get(users[0]!)).resolves.toEqual({ inboxCount: 2, requestCount: 1 });
    await expect(repository.get(users[4]!)).resolves.toEqual({ inboxCount: 1, requestCount: 0 });
  });
});

import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresListConversationsRepository } from "../list-conversations.repository";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("list conversations Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 6 }, (_, index) => `list-conversations-${crypto.randomUUID()}-${index}`);
  const { direct, send } = createMessagingPersistenceServices(database.db);
  const repository = createPostgresListConversationsRepository(database.db);

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now()), (${users[0]!}, ${users[2]!}, 'active', now()), (${users[2]!}, ${users[0]!}, 'active', now())`;
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

  it("keeps membership, folders, precise cursors, pages, unread state, and latest-message DTOs", async () => {
    const activeWithUnread = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "first active message",
    });
    const reply = await send.send(users[1]!, activeWithUnread.conversation.id, {
      clientMessageId: crypto.randomUUID(),
      text: "latest active message",
    });
    const activeWithoutUnread = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "second active message",
    });
    const incomingRequest = await direct.create(users[3]!, {
      recipientId: users[0]!,
      clientMessageId: crypto.randomUUID(),
      text: "incoming request",
    });
    await direct.create(users[0]!, {
      recipientId: users[4]!,
      clientMessageId: crypto.randomUUID(),
      text: "outgoing request",
    });

    await database.client`update public.conversations set last_activity_at = ${"2026-09-28T06:00:00.000001Z"}::timestamptz where id = ${activeWithUnread.conversation.id}`;
    await database.client`update public.conversations set last_activity_at = ${"2026-09-28T06:00:00.000002Z"}::timestamptz where id = ${activeWithoutUnread.conversation.id}`;

    const first = await repository.list(users[0]!, "inbox", undefined, 1);
    const second = await repository.list(users[0]!, "inbox", first.nextCursor ?? undefined, 1);
    const [cursorActivity] = JSON.parse(atob(first.nextCursor!)) as [string, string];

    expect(cursorActivity).toContain(".000002");
    expect(first.items).toMatchObject([{ id: activeWithoutUnread.conversation.id }]);
    expect(second.items).toMatchObject([{ id: activeWithUnread.conversation.id }]);
    expect(second.nextCursor).toBeNull();

    const inbox = await repository.list(users[0]!, "inbox", undefined, 10);
    expect(inbox.items).toHaveLength(2);
    expect(inbox.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: activeWithUnread.conversation.id,
        peer: { id: users[1], name: null },
        requestState: "active",
        latestMessage: expect.objectContaining({
          id: reply.message.id,
          sequence: "2",
          senderId: users[1],
          text: "latest active message",
        }),
        unreadCount: 1,
        lastMessageSequence: "2",
        lastReadSequence: "0",
        receiptSequence: "0",
        capabilities: { canSend: true, canResolveRequest: false },
      }),
    ]));

    await expect(repository.list(users[0]!, "requests", undefined, 10)).resolves.toMatchObject({
      items: [expect.objectContaining({
        id: incomingRequest.conversation.id,
        peer: { id: users[3], name: null },
        requestState: "pending",
        latestMessage: expect.objectContaining({ text: "incoming request", senderId: users[3] }),
        unreadCount: 1,
        capabilities: { canSend: false, canResolveRequest: true },
      })],
      nextCursor: null,
    });
    await expect(repository.list(users[5]!, "inbox", undefined, 10)).resolves.toEqual({ items: [], nextCursor: null });
    await expect(repository.list(users[5]!, "requests", undefined, 10)).resolves.toEqual({ items: [], nextCursor: null });
  });
});

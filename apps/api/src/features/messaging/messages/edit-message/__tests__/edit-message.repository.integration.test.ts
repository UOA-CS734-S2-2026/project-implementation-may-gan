import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../../../app";
import { createPostgresEditMessageStore } from "../edit-message.repository";
import { createEditMessageService } from "../edit-message.service";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("edit message Postgres repository", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 2 }, (_, index) => `edit-message-${crypto.randomUUID()}-${index}`);
  let now = new Date("2026-09-29T10:00:00.000Z");
  const { direct } = createMessagingPersistenceServices(database.db, { now: () => now });
  const edit = createEditMessageService({ store: createPostgresEditMessageStore(database.db), now: () => now });

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now())`;
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

  it("enforces edit policy and atomically persists edits, changes, and realtime outbox work", async () => {
    const created = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "original",
    });

    await expect(edit.edit(users[1]!, created.conversation.id, created.message.id, {
      text: "not mine",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(edit.edit(users[0]!, created.conversation.id, created.message.id, {
      text: "edited",
      expectedVersion: 1,
    })).resolves.toMatchObject({ text: "edited", version: 2 });
    await expect(edit.edit(users[0]!, created.conversation.id, created.message.id, {
      text: "stale",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const [changes] = await database.client`select count(*)::int as count from public.conversation_changes where conversation_id = ${created.conversation.id} and kind = 'message.edited'`;
    const [outbox] = await database.client`select count(*)::int as count from public.messaging_outbox where conversation_id = ${created.conversation.id} and channel = 'realtime'`;
    expect(changes?.count).toBe(1);
    expect(outbox?.count).toBe(4);

    const expiring = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "expiring",
    });
    now = new Date(new Date(expiring.message.createdAt).getTime() + 15 * 60_000);
    await expect(edit.edit(users[0]!, expiring.conversation.id, expiring.message.id, {
      text: "late",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "EDIT_WINDOW_EXPIRED" });

    now = new Date("2026-09-29T11:00:00.000Z");
    const unsent = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "unsent",
    });
    await database.client`update public.messages set body = null, unsent_at = now() where id = ${unsent.message.id}`;
    await expect(edit.edit(users[0]!, unsent.conversation.id, unsent.message.id, {
      text: "cannot edit",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const blocked = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "blocked",
    });
    await database.client`insert into public.relationship_blocks (blocker_id, blocked_id, blocked_at) values (${users[1]!}, ${users[0]!}, now())`;
    await expect(edit.edit(users[0]!, blocked.conversation.id, blocked.message.id, {
      text: "cannot edit",
      expectedVersion: 1,
    })).rejects.toMatchObject({ code: "BLOCKED" });
  });
});

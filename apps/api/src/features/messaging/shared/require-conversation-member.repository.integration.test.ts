import { createDayliDatabase, sql } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMessagingPersistenceServices } from "../../../app";
import { requireConversationMember } from "./require-conversation-member";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("require conversation member Postgres query", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const concurrentDatabase = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = Array.from({ length: 3 }, (_, index) => `require-conversation-member-${crypto.randomUUID()}-${index}`);
  const { direct } = createMessagingPersistenceServices(database.db);

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
    await database.client`insert into public.friendships (user_id, friend_id, state, state_changed_at) values (${users[0]!}, ${users[1]!}, 'active', now()), (${users[1]!}, ${users[0]!}, 'active', now())`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public.relationship_blocks where blocker_id = any(${users}::text[]) or blocked_id = any(${users}::text[])`;
      await database.client`delete from public.friendships where user_id = any(${users}::text[]) or friend_id = any(${users}::text[])`;
      await database.client`delete from public.friend_requests where sender_id = any(${users}::text[]) or recipient_id = any(${users}::text[])`;
      await database.client`delete from public.user where id = any(${users}::text[])`;
    } finally {
      await concurrentDatabase.close();
      await database.close();
    }
  });

  it("keeps a nonmember conversation lookup indistinguishable from an absent conversation", async () => {
    const conversation = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "private",
    });

    await expect(requireConversationMember(database.db, users[2]!, conversation.conversation.id))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(requireConversationMember(database.db, users[2]!, crypto.randomUUID()))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("preserves safe native bigint state and locks both conversation and actor member rows", async () => {
    const conversation = await direct.create(users[0]!, {
      recipientId: users[1]!,
      clientMessageId: crypto.randomUUID(),
      text: "locked",
    });
    const memberId = users[1]!;
    const memberSequence = Number.MAX_SAFE_INTEGER;
    await database.db.execute(sql`
      update public.conversations
      set last_message_sequence = ${memberSequence}::bigint, last_change_sequence = ${memberSequence}::bigint
      where id = ${conversation.conversation.id}
    `);
    await database.db.execute(sql`
      update public.conversation_members
      set last_read_sequence = ${memberSequence}::bigint, receipt_sequence = ${memberSequence}::bigint
      where conversation_id = ${conversation.conversation.id} and user_id = ${memberId}
    `);

    let releaseLock: (() => void) | undefined;
    let signalLocked: (() => void) | undefined;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    const holder = database.db.transaction(async (tx) => {
      const member = await requireConversationMember(tx, memberId, conversation.conversation.id, true);
      expect(member).toMatchObject({
        last_message_sequence: memberSequence,
        last_change_sequence: memberSequence,
        last_read_sequence: memberSequence,
        receipt_sequence: memberSequence,
      });
      signalLocked!();
      await release;
    });

    await locked;
    try {
      await expect(concurrentDatabase.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '100ms'`);
        await tx.execute(sql`
          update public.conversation_members
          set last_read_sequence = last_read_sequence
          where conversation_id = ${conversation.conversation.id} and user_id = ${memberId}
        `);
      })).rejects.toMatchObject({ cause: { code: "55P03" } });
      await expect(concurrentDatabase.db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '100ms'`);
        await tx.execute(sql`
          update public.conversations
          set updated_at = updated_at
          where id = ${conversation.conversation.id}
        `);
      })).rejects.toMatchObject({ cause: { code: "55P03" } });
    } finally {
      releaseLock!();
      await holder;
    }
  });

  it("fails closed for every overflowing sequence column within a locked transaction", async () => {
    const conversation = await direct.create(users[0]!, {
      recipientId: users[2]!,
      clientMessageId: crypto.randomUUID(),
      text: "overflow",
    });
    const memberId = users[2]!;
    const overflow = "9007199254740993";
    await database.db.execute(sql`
      update public.conversations
      set last_message_sequence = 1, last_change_sequence = 1
      where id = ${conversation.conversation.id}
    `);
    await database.db.execute(sql`
      update public.conversation_members
      set last_read_sequence = 0, receipt_sequence = 0
      where conversation_id = ${conversation.conversation.id} and user_id = ${memberId}
    `);
    const expectOverflowToFail = async () => {
      await expect(database.db.transaction((tx) => requireConversationMember(
        tx,
        memberId,
        conversation.conversation.id,
        true,
      ))).rejects.toThrow("Database sequence must be a safe nonnegative integer.");
    };

    await database.db.execute(sql`
      update public.conversations set last_message_sequence = ${overflow}::bigint
      where id = ${conversation.conversation.id}
    `);
    await expectOverflowToFail();
    await database.db.execute(sql`
      update public.conversations set last_message_sequence = 1
      where id = ${conversation.conversation.id}
    `);

    await database.db.execute(sql`
      update public.conversations set last_change_sequence = ${overflow}::bigint
      where id = ${conversation.conversation.id}
    `);
    await expectOverflowToFail();
    await database.db.execute(sql`
      update public.conversations set last_change_sequence = 1
      where id = ${conversation.conversation.id}
    `);

    await database.db.execute(sql`
      update public.conversation_members set last_read_sequence = ${overflow}::bigint
      where conversation_id = ${conversation.conversation.id} and user_id = ${memberId}
    `);
    await expectOverflowToFail();
    await database.db.execute(sql`
      update public.conversation_members set last_read_sequence = 0
      where conversation_id = ${conversation.conversation.id} and user_id = ${memberId}
    `);

    await database.db.execute(sql`
      update public.conversation_members
      set last_read_sequence = ${overflow}::bigint, receipt_sequence = ${overflow}::bigint
      where conversation_id = ${conversation.conversation.id} and user_id = ${memberId}
    `);
    await expectOverflowToFail();
  });
});

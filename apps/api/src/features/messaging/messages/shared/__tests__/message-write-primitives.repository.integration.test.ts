import { createDayliDatabase } from "@dayli/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendPeerChange, findMessage, getAccess } from "../message-write-primitives";

const connectionString = process.env.MESSAGING_TEST_DATABASE_URL;
const enabled = Boolean(connectionString);
const target = connectionString ? new URL(connectionString) : undefined;
if (enabled && target?.hostname === "localhost" && target.port === "5433" && target.pathname !== "/dayli_messaging_test") {
  throw new Error("MESSAGING_TEST_DATABASE_URL must use the isolated dayli_messaging_test database.");
}
const suite = enabled ? describe : describe.skip;

suite("message write primitive builders", () => {
  const database = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const contender = createDayliDatabase(connectionString ?? "postgresql://invalid/messaging_tests");
  const users = [
    `write-primitive-a-${crypto.randomUUID()}`,
    `write-primitive-b-${crypto.randomUUID()}`,
    `write-primitive-outsider-${crypto.randomUUID()}`,
  ];

  beforeAll(async () => {
    await database.client`insert into public."user" (id, name, email) select id, id, id || '@example.test' from unnest(${users}::text[]) as ids(id)`;
  });

  afterAll(async () => {
    try {
      await database.client`delete from public."user" where id = any(${users}::text[])`;
    } finally {
      await Promise.all([database.close(), contender.close()]);
    }
  });

  async function createConversation() {
    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const now = new Date("2026-09-30T00:00:00.000Z");
    await database.client`delete from public.conversations where participant_low_id = ${users[0]!} and participant_high_id = ${users[1]!}`;
    await database.client`insert into public.conversations (id, kind, participant_low_id, participant_high_id, initiator_participant_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at) values (${conversationId}, 'direct', ${users[0]!}, ${users[1]!}, ${users[0]!}, 'active', 9007199254740992, 9007199254740992, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)`;
    await database.client`insert into public.conversation_members (conversation_id, participant_id, last_read_sequence, receipt_sequence, created_at, updated_at) values (${conversationId}, ${users[0]!}, 0, 0, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz), (${conversationId}, ${users[1]!}, 0, 0, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz)`;
    await database.client`insert into public.messages (id, conversation_id, sequence, sender_participant_id, client_message_id, request_fingerprint, body, version, created_at) values (${messageId}, ${conversationId}, 9007199254740993, ${users[0]!}, ${crypto.randomUUID()}, ${crypto.randomUUID()}, 'message', 1, ${now.toISOString()}::timestamptz)`;
    await database.client`insert into public.message_reactions (message_id, participant_id, reaction, created_at) values (${messageId}, ${users[0]!}, 'like', ${now.toISOString()}::timestamptz), (${messageId}, ${users[1]!}, 'like', ${now.toISOString()}::timestamptz)`;
    return { conversationId, messageId };
  }

  it("preserves bigint rows, actor-specific reactions, private membership, and change sequences", async () => {
    const { conversationId, messageId } = await createConversation();

    await expect(findMessage(database.db, users[0]!, conversationId, messageId)).resolves.toMatchObject({
      sequence: 9007199254740993n,
      reactions: [{ reaction: "like", count: 2, reactedByActor: true }],
    });
    await expect(findMessage(database.db, users[2]!, conversationId, messageId)).resolves.toMatchObject({
      sequence: 9007199254740993n,
      reactions: [{ reaction: "like", count: 2, reactedByActor: false }],
    });
    await expect(getAccess(database.db, users[2]!, conversationId)).resolves.toEqual({
      conversationId,
      peerId: users[0],
      requestState: "active",
      isMember: false,
      peerUnavailable: false,
      peerActivityBlocked: false,
    });
    await expect(getAccess(database.db, users[0]!, crypto.randomUUID())).resolves.toEqual({
      conversationId: expect.any(String),
      peerId: "",
      requestState: "declined",
      isMember: false,
      peerUnavailable: false,
      peerActivityBlocked: false,
    });

    await appendPeerChange(database.db, { conversationId, messageId, kind: "message.created" });
    const [change] = await database.client`select change_sequence from public.conversation_changes where conversation_id = ${conversationId}`;
    const outbox = [...await database.client`select change_sequence from public.messaging_outbox where conversation_id = ${conversationId}`];
    expect(String(change?.change_sequence)).toBe("9007199254740993");
    expect(outbox.map((row) => String(row.change_sequence))).toEqual(["9007199254740993", "9007199254740993"]);
  });

  it("serializes concurrent access through the conversation row lock", async () => {
    const { conversationId } = await createConversation();
    let notifyFirstLocked: (() => void) | undefined;
    let releaseFirstLock: (() => void) | undefined;
    const firstLocked = new Promise<void>((resolve) => { notifyFirstLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirstLock = resolve; });
    const first = database.db.transaction(async (transaction) => {
      await getAccess(transaction, users[0]!, conversationId);
      notifyFirstLocked!();
      await release;
    });
    await firstLocked;

    let contenderFinished = false;
    const second = contender.db.transaction(async (transaction) => {
      await getAccess(transaction, users[1]!, conversationId);
      contenderFinished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(contenderFinished).toBe(false);
    releaseFirstLock!();
    await Promise.all([first, second]);
    expect(contenderFinished).toBe(true);
  });
});

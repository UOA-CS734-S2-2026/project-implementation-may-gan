import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const migratorUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(migratorUrl);

function requireLocalUrl(value: string | undefined): string {
  if (!value) throw new Error("TEST_DATABASE_URL is required for messaging participant integration tests.");
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== "5433" || url.pathname !== "/dayli_test" || url.username !== "migrator") {
    throw new Error("TEST_DATABASE_URL must target migrator@localhost:5433/dayli_test.");
  }
  return value;
}

(enabled ? describe : describe.skip)("messaging participant retention", () => {
  const database = postgres(requireLocalUrl(migratorUrl ?? "postgresql://migrator:migrator@localhost:5433/dayli_test"), { max: 1, prepare: false, onnotice: () => undefined });
  const users: string[] = [];
  const conversations: string[] = [];

  async function createUser(label: string): Promise<string> {
    const id = `messaging-participant-${label}-${crypto.randomUUID()}`;
    users.push(id);
    await database`insert into public."user" (id, name, email) values (${id}, ${label}, ${`${id}@example.test`})`;
    return id;
  }

  afterAll(async () => {
    try {
      if (users.length > 0) await database`delete from public."user" where id = any(${users})`;
      if (conversations.length > 0) await database`delete from public.conversations where id = any(${conversations})`;
    } finally {
      await database.end({ timeout: 5 });
    }
  });

  it("detaches a deleted account without cascading Bob's retained text or reactions", async () => {
    const alice = await createUser("Alice");
    const bob = await createUser("Bob");
    const conversation = `conversation-${crypto.randomUUID()}`;
    const message = `message-${crypto.randomUUID()}`;
    conversations.push(conversation);
    const now = new Date().toISOString();

    await database`
      insert into public.conversations
        (id, kind, participant_low_id, participant_high_id, initiator_participant_id, request_state, last_message_sequence, last_change_sequence, last_activity_at, created_at, updated_at)
      values (${conversation}, 'direct', least(${alice}, ${bob}), greatest(${alice}, ${bob}), ${alice}, 'active', 1, 0, ${now}, ${now}, ${now})
    `;
    await database`
      insert into public.conversation_members (conversation_id, participant_id, last_read_sequence, receipt_sequence, created_at, updated_at)
      values (${conversation}, ${alice}, 0, 0, ${now}, ${now}), (${conversation}, ${bob}, 0, 0, ${now}, ${now})
    `;
    await database`
      insert into public.messages (id, conversation_id, sequence, sender_participant_id, client_message_id, request_fingerprint, body, version, created_at)
      values (${message}, ${conversation}, 1, ${alice}, 'client-message', ${"a".repeat(64)}, 'retained sent text', 1, ${now})
    `;
    await database`
      insert into public.message_reactions (message_id, participant_id, reaction, created_at)
      values (${message}, ${alice}, 'like', ${now}), (${message}, ${bob}, 'thanks', ${now})
    `;

    await database`delete from public."user" where id = ${alice}`;

    const retained = await database`
      select participant.state, participant.user_id, message.body, reaction.participant_id, reaction.reaction
      from public.messaging_participants participant
      join public.messages message on message.sender_participant_id = participant.id
      join public.message_reactions reaction on reaction.message_id = message.id
      where participant.id = ${alice}
      order by reaction.participant_id
    `;
    expect(retained).toEqual(expect.arrayContaining([
      { state: "deleted", user_id: null, body: "retained sent text", participant_id: alice, reaction: "like" },
      { state: "deleted", user_id: null, body: "retained sent text", participant_id: bob, reaction: "thanks" },
    ]));
    await expect(database`select id from public.conversations where id = ${conversation}`).resolves.toEqual([{ id: conversation }]);
    await expect(database`select id, state from public.messaging_participants where id = ${bob}`).resolves.toEqual([{ id: bob, state: "active" }]);

    await database`delete from public."user" where id = ${bob}`;
    await expect(database`select id from public.messaging_retained_conversation_candidates where id = ${conversation}`).resolves.toEqual([{ id: conversation }]);
    await expect(database`select id from public.conversations where id = ${conversation}`).resolves.toEqual([{ id: conversation }]);
  });
});

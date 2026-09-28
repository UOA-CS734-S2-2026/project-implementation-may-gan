import { describe, expect, it } from "vitest";
import { createEditMessageService } from "./edit-message/edit-message.service";
import { createRemoveReactionService } from "./remove-reaction/remove-reaction.service";
import { createSendMessageService } from "./send-message/send-message.service";
import { createSetReactionService } from "./set-reaction/set-reaction.service";
import { createUnsendMessageService } from "./unsend-message/unsend-message.service";
import type { MessageWriteStore, MessageWriteTransaction } from "../shared/message-store";
import type { StoredMessage } from "../shared/messaging-types";

const now = new Date("2026-09-28T05:00:00.000Z");

function message(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: "message-1", conversationId: "conversation-1", sequence: 1n,
    senderId: "alice", clientMessageId: "client-1", requestFingerprint: "fingerprint",
    body: "hello", replyToMessageId: null, version: 1, createdAt: new Date("2026-09-28T04:50:00.000Z"),
    editedAt: null, unsentAt: null, reactions: [], ...overrides,
  };
}

function memory(initial = message()) {
  const messages = new Map([[initial.id, initial]]);
  const idempotency = new Map<string, StoredMessage>();
  const changes: string[] = [];
  const transaction: MessageWriteTransaction = {
    getAccess: async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true, peerActivityBlocked: false }),
    activateForFriendship: async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true, peerActivityBlocked: false }),
    findIdempotentMessage: async (sender, clientMessageId) => {
      const found = idempotency.get(`${sender}:${clientMessageId}`);
      return found ? { requestFingerprint: found.requestFingerprint, message: found } : null;
    },
    findMessage: async (_conversationId, id) => messages.get(id) ?? null,
    insertMessage: async (input) => {
      const saved = message({ id: input.id, senderId: input.senderId, clientMessageId: input.clientMessageId, requestFingerprint: input.requestFingerprint, body: input.text, replyToMessageId: input.replyToMessageId, createdAt: input.createdAt, sequence: BigInt(messages.size + 1) });
      messages.set(saved.id, saved); idempotency.set(`${saved.senderId}:${saved.clientMessageId}`, saved); return saved;
    },
    updateMessage: async (input) => {
      const old = messages.get(input.messageId)!;
      if (input.expectedVersion !== undefined && old.version !== input.expectedVersion) throw new Error("stale write");
      const updated = message({ ...old, body: input.body === undefined ? old.body : input.body, editedAt: input.editedAt === undefined ? old.editedAt : input.editedAt, unsentAt: input.unsentAt === undefined ? old.unsentAt : input.unsentAt, version: old.version + 1, reactions: input.unsentAt ? [] : old.reactions });
      messages.set(updated.id, updated); return updated;
    },
    setReaction: async (id, _actor, reaction) => {
      const old = messages.get(id)!; const updated = message({ ...old, reactions: [{ reaction, count: 1, reactedByActor: true }] }); messages.set(id, updated); return updated;
    },
    removeReaction: async (id) => { const old = messages.get(id)!; const updated = message({ ...old, reactions: [] }); messages.set(id, updated); return updated; },
    appendPeerChange: async (input) => { changes.push(input.kind); },
  };
  const store: MessageWriteStore = { withConversationTransaction: async (_actor, _conversation, action) => action(transaction) };
  return { store, messages, changes, transaction };
}

describe("message action services", () => {
  it("creates a message once and replays a matching client message ID", async () => {
    const state = memory();
    const service = createSendMessageService({ store: state.store, now: () => now, generateId: () => "message-2" });
    const first = await service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "a fresh note" });
    const retry = await service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "a fresh note" });
    expect(first.replayed).toBe(false); expect(retry.replayed).toBe(true); expect(state.changes).toEqual(["message.created"]);
    await expect(service.send("alice", "conversation-1", { clientMessageId: "client-2", text: "changed" })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects whitespace-only input and accepts 4,000 Unicode code points", async () => {
    const service = createSendMessageService({ store: memory().store, generateId: () => "message-2" });
    await expect(service.send("alice", "conversation-1", { clientMessageId: "a", text: " \n " })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(service.send("alice", "conversation-1", { clientMessageId: "b", text: "😀".repeat(4_000) })).resolves.toMatchObject({ replayed: false });
  });

  it("enforces sender ownership, strict 15 minute window, and versions for edits", async () => {
    const state = memory(); const service = createEditMessageService({ store: state.store, now: () => now });
    await expect(service.edit("alice", "conversation-1", "message-1", { text: "edited", expectedVersion: 1 })).resolves.toMatchObject({ text: "edited", version: 2 });
    await expect(service.edit("alice", "conversation-1", "message-1", { text: "again", expectedVersion: 1 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const expired = memory(message({ createdAt: new Date("2026-09-28T04:45:00.000Z") }));
    await expect(createEditMessageService({ store: expired.store, now: () => now }).edit("alice", "conversation-1", "message-1", { text: "late", expectedVersion: 1 })).rejects.toMatchObject({ code: "EDIT_WINDOW_EXPIRED" });
  });

  it("unsends into a body-free tombstone and removes reactions", async () => {
    const state = memory(message({ reactions: [{ reaction: "love", count: 1, reactedByActor: true }] }));
    const result = await createUnsendMessageService({ store: state.store, now: () => now }).unsend("alice", "conversation-1", "message-1");
    expect(result).toMatchObject({ replayed: false, message: { text: null, unsentAt: now.toISOString(), reactions: [] } });
    await expect(createUnsendMessageService({ store: state.store }).unsend("alice", "conversation-1", "message-1")).resolves.toMatchObject({ replayed: true });
  });

  it("sets one reaction per actor and makes repeated set/remove no-ops", async () => {
    const state = memory(); const set = createSetReactionService({ store: state.store }); const remove = createRemoveReactionService({ store: state.store });
    await expect(set.set("alice", "conversation-1", "message-1", "love")).resolves.toMatchObject({ changed: true });
    await expect(set.set("alice", "conversation-1", "message-1", "love")).resolves.toMatchObject({ changed: false });
    await expect(remove.remove("alice", "conversation-1", "message-1")).resolves.toMatchObject({ changed: true });
    await expect(remove.remove("alice", "conversation-1", "message-1")).resolves.toMatchObject({ changed: false });
  });

  it("allows the pending initiator to unsend the one initial message without allowing blocks", async () => {
    const state = memory(); state.transaction.getAccess = async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "pending", isMember: true, peerActivityBlocked: false });
    await expect(createUnsendMessageService({ store: state.store, now: () => now }).unsend("alice", "conversation-1", "message-1")).resolves.toMatchObject({ replayed: false, message: { text: null } });
  });

  it("allows the author to unsend a declined initial request but never a blocked pair", async () => {
    const state = memory(); state.transaction.getAccess = async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "declined", isMember: true, peerActivityBlocked: false });
    await expect(createUnsendMessageService({ store: state.store, now: () => now }).unsend("alice", "conversation-1", "message-1")).resolves.toMatchObject({ message: { text: null } });
  });

  it("does not allow peer-visible mutations while the pair is blocked", async () => {
    const state = memory(); state.transaction.getAccess = async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true, peerActivityBlocked: true });
    await expect(createUnsendMessageService({ store: state.store }).unsend("alice", "conversation-1", "message-1")).rejects.toMatchObject({ code: "BLOCKED" });
  });
});

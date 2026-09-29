import type { MessageWriteStore, MessageWriteTransaction } from "../../../src/features/messaging/shared/message-store";
import type { StoredMessage } from "../../../src/features/messaging/shared/messaging-types";

export const fixedMessageNow = new Date("2026-09-28T05:00:00.000Z");

export function message(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    sequence: 1n,
    senderId: "alice",
    clientMessageId: "client-1",
    requestFingerprint: "fingerprint",
    body: "hello",
    replyToMessageId: null,
    version: 1,
    createdAt: new Date("2026-09-28T04:50:00.000Z"),
    editedAt: null,
    unsentAt: null,
    reactions: [],
    ...overrides,
  };
}

export function messageMemory(initial = message()) {
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
      const saved = message({
        id: input.id,
        senderId: input.senderId,
        clientMessageId: input.clientMessageId,
        requestFingerprint: input.requestFingerprint,
        body: input.text,
        replyToMessageId: input.replyToMessageId,
        createdAt: input.createdAt,
        sequence: BigInt(messages.size + 1),
      });
      messages.set(saved.id, saved);
      idempotency.set(`${saved.senderId}:${saved.clientMessageId}`, saved);
      return saved;
    },
    updateMessage: async (input) => {
      const old = messages.get(input.messageId)!;
      if (input.expectedVersion !== undefined && old.version !== input.expectedVersion) throw new Error("stale write");
      const updated = message({
        ...old,
        body: input.body === undefined ? old.body : input.body,
        editedAt: input.editedAt === undefined ? old.editedAt : input.editedAt,
        unsentAt: input.unsentAt === undefined ? old.unsentAt : input.unsentAt,
        version: old.version + 1,
        reactions: input.unsentAt ? [] : old.reactions,
      });
      messages.set(updated.id, updated);
      return updated;
    },
    setReaction: async (id, _actor, reaction) => {
      const old = messages.get(id)!;
      const updated = message({ ...old, reactions: [{ reaction, count: 1, reactedByActor: true }] });
      messages.set(id, updated);
      return updated;
    },
    removeReaction: async (id) => {
      const old = messages.get(id)!;
      const updated = message({ ...old, reactions: [] });
      messages.set(id, updated);
      return updated;
    },
    appendPeerChange: async (input) => {
      changes.push(input.kind);
    },
  };
  const store: MessageWriteStore = {
    withConversationTransaction: async (_actor, _conversation, action) => action(transaction),
  };
  return { store, messages, changes, transaction };
}

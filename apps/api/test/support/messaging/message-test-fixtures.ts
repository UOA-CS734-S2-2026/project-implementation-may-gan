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
    appendPeerChange: async (input) => {
      changes.push(input.kind);
    },
  };
  const store: MessageWriteStore = {
    withConversationTransaction: async (_actor, _conversation, action) => action(transaction),
  };
  const editMessageTransaction = {
    getAccess: transaction.getAccess,
    findMessage: transaction.findMessage,
    editMessage: transaction.updateMessage,
    appendPeerChange: async (input: { conversationId: string; messageId: string; kind: "message.edited" }) => transaction.appendPeerChange(input),
  };
  const editStore = {
    withConversationTransaction: async <T>(_actor: string, _conversation: string, action: (transaction: typeof editMessageTransaction) => Promise<T>) => action(editMessageTransaction),
  };
  const setReactionTransaction = {
    getAccess: transaction.getAccess,
    findMessage: transaction.findMessage,
    setReaction: async (id: string, _actor: string, reaction: StoredMessage["reactions"][number]["reaction"]) => {
      const old = messages.get(id)!;
      const updated = message({ ...old, reactions: [{ reaction, count: 1, reactedByActor: true }] });
      messages.set(id, updated);
      return updated;
    },
    appendPeerChange: transaction.appendPeerChange,
  };
  const setReactionStore = {
    withConversationTransaction: async <T>(_actor: string, _conversation: string, action: (transaction: typeof setReactionTransaction) => Promise<T>) => action(setReactionTransaction),
  };
  const removeReactionTransaction = {
    getAccess: transaction.getAccess,
    findMessage: transaction.findMessage,
    removeReaction: async (id: string) => {
      const old = messages.get(id)!;
      const reactions = old.reactions.flatMap((summary) => {
        if (!summary.reactedByActor) return [summary];
        return summary.count === 1 ? [] : [{ ...summary, count: summary.count - 1, reactedByActor: false }];
      });
      const updated = message({ ...old, reactions });
      messages.set(id, updated);
      return updated;
    },
    appendPeerChange: transaction.appendPeerChange,
  };
  const removeReactionStore = {
    withConversationTransaction: async <T>(_actor: string, _conversation: string, action: (transaction: typeof removeReactionTransaction) => Promise<T>) => action(removeReactionTransaction),
  };
  return { store, editStore, setReactionStore, removeReactionStore, messages, changes, transaction };
}

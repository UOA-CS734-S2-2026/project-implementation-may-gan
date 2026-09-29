import type { ConversationAccess, ConversationPeerChange, StoredMessage } from "../../../src/features/messaging/shared/messaging-types";

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

type MessageMemoryTransaction = {
  getAccess(actorId: string, conversationId: string): Promise<ConversationAccess>;
  findMessage(conversationId: string, messageId: string): Promise<StoredMessage | null>;
  appendPeerChange(input: ConversationPeerChange): Promise<void>;
};

export function messageMemory(initial = message()) {
  const messages = new Map([[initial.id, initial]]);
  const changes: string[] = [];
  const updateMessage = async (input: {
    messageId: string;
    body?: string | null;
    editedAt?: Date | null;
    unsentAt?: Date | null;
    expectedVersion?: number;
  }) => {
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
  };
  const transaction: MessageMemoryTransaction = {
    getAccess: async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true, peerActivityBlocked: false }),
    findMessage: async (_conversationId, id) => messages.get(id) ?? null,
    appendPeerChange: async (input) => {
      changes.push(input.kind);
    },
  };
  const editMessageTransaction = {
    getAccess: transaction.getAccess,
    findMessage: transaction.findMessage,
    editMessage: updateMessage,
    appendPeerChange: async (input: { conversationId: string; messageId: string; kind: "message.edited" }) => transaction.appendPeerChange(input),
  };
  const editStore = {
    withConversationTransaction: async <T>(_actor: string, _conversation: string, action: (transaction: typeof editMessageTransaction) => Promise<T>) => action(editMessageTransaction),
  };
  const unsendMessageTransaction = {
    getAccess: (actorId: string, conversationId: string) => transaction.getAccess(actorId, conversationId),
    findMessage: transaction.findMessage,
    unsendMessage: async (input: { messageId: string; unsentAt: Date }) => updateMessage({ ...input, body: null }),
    appendPeerChange: async (input: { conversationId: string; messageId: string; kind: "message.unsent" }) => transaction.appendPeerChange(input),
  };
  const unsendStore = {
    withConversationTransaction: async <T>(_actor: string, _conversation: string, action: (transaction: typeof unsendMessageTransaction) => Promise<T>) => action(unsendMessageTransaction),
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
  return { editStore, unsendStore, setReactionStore, removeReactionStore, messages, changes, transaction };
}

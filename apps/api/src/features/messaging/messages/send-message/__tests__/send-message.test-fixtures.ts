import type { StoredMessage } from "../../../shared/messaging-types";
import type { SendMessageStore, SendMessageTransaction } from "../send-message.repository";

function storedMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
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

export function sendMessageMemory(initial = storedMessage()) {
  const messages = new Map([[initial.id, initial]]);
  const idempotency = new Map<string, StoredMessage>();
  const changes: string[] = [];
  const transaction: SendMessageTransaction = {
    getAccess: async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true, participantsAvailable: true, peerActivityBlocked: false }),
    activateForFriendship: async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true, participantsAvailable: true, peerActivityBlocked: false }),
    findIdempotentMessage: async (senderId, clientMessageId) => {
      const found = idempotency.get(`${senderId}:${clientMessageId}`);
      return found ? { requestFingerprint: found.requestFingerprint, message: found } : null;
    },
    findMessage: async (_conversationId, messageId) => messages.get(messageId) ?? null,
    claimNewMessageSlot: async () => new Date("2026-09-28T04:50:00.000Z"),
    insertMessage: async (input) => {
      const saved = storedMessage({
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
    appendPeerChange: async (input) => {
      changes.push(input.kind);
    },
  };
  const store: SendMessageStore = {
    withConversationTransaction: async (_actorId, _conversationId, operation) => operation(transaction),
  };
  return { store, messages, changes, transaction };
}

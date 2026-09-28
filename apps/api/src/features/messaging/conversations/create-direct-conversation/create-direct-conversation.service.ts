import { MessagingError } from "../../shared/messaging-error";
import { assertMessageText, fingerprintMessageRequest } from "../../shared/message-validation";
import { toMessageDto } from "../../shared/message-projection";
import type { MessageDto, StoredMessage } from "../../shared/messaging-types";

export interface DirectConversation {
  id: string;
  requestState: "pending" | "active" | "declined";
  peerId: string;
}

export interface DirectConversationTransaction {
  /** Acquires the relationship-pair lock before resolving either participant. */
  findDirectConversation(actorId: string, recipientId: string): Promise<DirectConversation | null>;
  recipientExists(recipientId: string): Promise<boolean>;
  hasActiveFriendship(actorId: string, recipientId: string): Promise<boolean>;
  findIdempotentMessage(senderId: string, clientMessageId: string): Promise<{ requestFingerprint: string; conversation: DirectConversation; message: StoredMessage } | null>;
  /** Creates a pair-unique conversation and first message plus change/outbox work in one transaction. */
  createConversationWithMessage(input: {
    conversationId: string; initiatorId: string; recipientId: string; requestState: "pending" | "active";
    messageId: string; clientMessageId: string; requestFingerprint: string; text: string; createdAt: Date;
  }): Promise<{ conversation: DirectConversation; message: StoredMessage }>;
  /** Existing active threads accept a distinct message through this same pair-locked transaction. */
  appendExistingMessage(input: {
    conversation: DirectConversation; senderId: string; clientMessageId: string; requestFingerprint: string; text: string; createdAt: Date; messageId: string;
  }): Promise<StoredMessage>;
}

export interface DirectConversationStore {
  withDirectTransaction<T>(actorId: string, recipientId: string, action: (transaction: DirectConversationTransaction) => Promise<T>): Promise<T>;
}

export interface CreateDirectConversationService {
  create(actorId: string, input: { recipientId: string; clientMessageId: string; text: string }): Promise<{ conversation: DirectConversation; message: MessageDto; replayed: boolean }>;
}

export function createCreateDirectConversationService(dependencies: {
  store: DirectConversationStore; now?: () => Date; generateId?: () => string;
}): CreateDirectConversationService {
  const now = dependencies.now ?? (() => new Date());
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID());
  return {
    async create(actorId, input) {
      if (actorId === input.recipientId) throw new MessagingError("FORBIDDEN");
      assertMessageText(input.text);
      return dependencies.store.withDirectTransaction(actorId, input.recipientId, async (transaction) => {
        const existing = await transaction.findDirectConversation(actorId, input.recipientId);
        // The direct-create request is addressed to a pair, not a prior thread ID.
        // This stable target keeps a lost first response replayable after creation.
        const fingerprint = await fingerprintMessageRequest({ conversationId: `direct:${input.recipientId}`, recipientId: input.recipientId, text: input.text, replyToMessageId: null });
        const replay = await transaction.findIdempotentMessage(actorId, input.clientMessageId);
        if (replay) {
          if (replay.requestFingerprint !== fingerprint) throw new MessagingError("IDEMPOTENCY_KEY_REUSED");
          return { conversation: replay.conversation, message: toMessageDto(replay.message), replayed: true };
        }
        if (existing) {
          if (existing.requestState === "pending") throw new MessagingError("PENDING");
          if (existing.requestState === "declined") throw new MessagingError("DECLINED");
          const message = await transaction.appendExistingMessage({ conversation: existing, senderId: actorId, clientMessageId: input.clientMessageId, requestFingerprint: fingerprint, text: input.text, createdAt: now(), messageId: generateId() });
          return { conversation: existing, message: toMessageDto(message), replayed: false };
        }
        if (!await transaction.recipientExists(input.recipientId)) throw new MessagingError("NOT_FOUND");
        const requestState = await transaction.hasActiveFriendship(actorId, input.recipientId) ? "active" as const : "pending" as const;
        const result = await transaction.createConversationWithMessage({ conversationId: generateId(), initiatorId: actorId, recipientId: input.recipientId, requestState, messageId: generateId(), clientMessageId: input.clientMessageId, requestFingerprint: fingerprint, text: input.text, createdAt: now() });
        return { conversation: result.conversation, message: toMessageDto(result.message), replayed: false };
      });
    },
  };
}

import { MessagingError } from "../../shared/messaging-error";
import { assertMessageText, fingerprintMessageRequest } from "../../shared/message-validation";
import { toMessageDto } from "../../shared/message-projection";
import type { MessageDto } from "../../shared/messaging-types";
import type {
  DirectConversation,
  DirectConversationStore,
} from "../../shared/conversation-types";

export type {
  DirectConversation,
  DirectConversationStore,
  DirectConversationTransaction,
} from "../../shared/conversation-types";

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
        // Check before replay so a stale retry cannot emit a peer-visible
        // result after either participant has blocked the pair.
        if (await transaction.isPairBlocked(actorId, input.recipientId)) throw new MessagingError("BLOCKED");
        const existing = await transaction.findDirectConversation(actorId, input.recipientId);
        // The direct-create request is addressed to a pair, not a prior thread ID.
        // This stable target keeps a lost first response replayable after creation.
        const fingerprint = await fingerprintMessageRequest({ conversationId: `direct:${input.recipientId}`, recipientId: input.recipientId, text: input.text, replyToMessageId: null });
        const replay = await transaction.findIdempotentMessage(actorId, input.clientMessageId);
        if (replay) {
          if (replay.requestFingerprint !== fingerprint) throw new MessagingError("IDEMPOTENCY_KEY_REUSED");
          return { conversation: replay.conversation, message: toMessageDto(replay.message), replayed: true };
        }
        if (!await transaction.participantsAvailable()) throw new MessagingError("FORBIDDEN");
        const friendshipActive = await transaction.hasActiveFriendship(actorId, input.recipientId);
        if (existing) {
          if (!friendshipActive && existing.requestState === "pending") throw new MessagingError("PENDING");
          if (!friendshipActive && existing.requestState === "declined") throw new MessagingError("DECLINED");
          const conversation = existing.requestState === "active" ? existing : await transaction.activateConversation(existing, now());
          const message = await transaction.appendExistingMessage({ conversation, senderId: actorId, clientMessageId: input.clientMessageId, requestFingerprint: fingerprint, text: input.text, createdAt: now(), messageId: generateId() });
          return { conversation, message: toMessageDto(message), replayed: false };
        }
        if (!await transaction.recipientExists(input.recipientId)) throw new MessagingError("NOT_FOUND");
        const requestState = friendshipActive ? "active" as const : "pending" as const;
        const result = await transaction.createConversationWithMessage({ conversationId: generateId(), initiatorId: actorId, recipientId: input.recipientId, requestState, messageId: generateId(), clientMessageId: input.clientMessageId, requestFingerprint: fingerprint, text: input.text, createdAt: now() });
        return { conversation: result.conversation, message: toMessageDto(result.message), replayed: false };
      });
    },
  };
}

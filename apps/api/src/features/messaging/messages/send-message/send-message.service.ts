import { assertConversationMember, assertPeerActivityAllowed } from "../../shared/conversation-access";
import { MessagingError } from "../../shared/messaging-error";
import { fingerprintMessageRequest, assertMessageText } from "../../shared/message-validation";
import { toMessageDto } from "../../shared/message-projection";
import type { MessageWriteStore } from "../../shared/message-store";
import type { MessageDto } from "../../shared/messaging-types";

export interface SendMessageInput {
  clientMessageId: string;
  text: string;
  replyToMessageId?: string;
}

export interface SendMessageResult {
  message: MessageDto;
  replayed: boolean;
}

export interface SendMessageService {
  send(actorId: string, conversationId: string, input: SendMessageInput): Promise<SendMessageResult>;
}

export function createSendMessageService(dependencies: {
  store: MessageWriteStore;
  now?: () => Date;
  generateId?: () => string;
}): SendMessageService {
  const now = dependencies.now ?? (() => new Date());
  const generateId = dependencies.generateId ?? (() => crypto.randomUUID());

  return {
    async send(actorId, conversationId, input) {
      assertMessageText(input.text);
      const replyToMessageId = input.replyToMessageId ?? null;
      return dependencies.store.withConversationTransaction(actorId, conversationId, async (transaction) => {
        let access = await transaction.getAccess(actorId, conversationId);
        assertConversationMember(access);
        const fingerprint = await fingerprintMessageRequest({
          conversationId,
          recipientId: access.peerId,
          text: input.text,
          replyToMessageId,
        });
        const previous = await transaction.findIdempotentMessage(actorId, input.clientMessageId);
        if (previous) {
          if (previous.requestFingerprint !== fingerprint) throw new MessagingError("IDEMPOTENCY_KEY_REUSED");
          return { message: toMessageDto(previous.message), replayed: true };
        }

        if (access.requestState !== "active") access = await transaction.activateForFriendship(actorId, conversationId);
        assertPeerActivityAllowed(access);
        if (replyToMessageId) {
          const parent = await transaction.findMessage(conversationId, replyToMessageId);
          if (!parent) throw new MessagingError("REPLY_NOT_FOUND");
        }
        const message = await transaction.insertMessage({
          id: generateId(),
          conversationId,
          senderId: actorId,
          clientMessageId: input.clientMessageId,
          requestFingerprint: fingerprint,
          text: input.text,
          replyToMessageId,
          createdAt: now(),
        });
        await transaction.appendPeerChange({ conversationId, messageId: message.id, kind: "message.created" });
        return { message: toMessageDto(message), replayed: false };
      });
    },
  };
}

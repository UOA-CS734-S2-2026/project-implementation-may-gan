import { assertUnsendAllowed } from "../../shared/conversation-access";
import { MessagingError } from "../../shared/messaging-error";
import { toMessageDto } from "../../shared/message-projection";
import type { MessageWriteStore } from "../../shared/message-store";
import type { MessageDto } from "../../shared/messaging-types";

export interface UnsendMessageService {
  unsend(actorId: string, conversationId: string, messageId: string): Promise<{ message: MessageDto; replayed: boolean }>;
}

export function createUnsendMessageService(dependencies: { store: MessageWriteStore; now?: () => Date }): UnsendMessageService {
  const now = dependencies.now ?? (() => new Date());
  return {
    async unsend(actorId, conversationId, messageId) {
      return dependencies.store.withConversationTransaction(actorId, conversationId, async (transaction) => {
        const access = await transaction.getAccess(actorId, conversationId);
        assertUnsendAllowed(access);
        const message = await transaction.findMessage(conversationId, messageId);
        if (!message) throw new MessagingError("NOT_FOUND");
        if (message.senderId !== actorId) throw new MessagingError("FORBIDDEN");
        if (message.unsentAt) return { message: toMessageDto(message), replayed: true };
        const updated = await transaction.updateMessage({ messageId, body: null, unsentAt: now() });
        await transaction.appendPeerChange({ conversationId, messageId, kind: "message.unsent" });
        return { message: toMessageDto(updated), replayed: false };
      });
    },
  };
}

import { assertPeerActivityAllowed } from "../../shared/conversation-access";
import { MessagingError } from "../../shared/messaging-error";
import { assertMessageText } from "../../shared/message-validation";
import { toMessageDto } from "../../shared/message-projection";
import type { MessageDto } from "../../shared/messaging-types";
import type { EditMessageStore } from "./edit-message.repository";

export interface EditMessageService {
  edit(actorId: string, conversationId: string, messageId: string, input: { text: string; expectedVersion: number }): Promise<MessageDto>;
}

export function createEditMessageService(dependencies: { store: EditMessageStore; now?: () => Date }): EditMessageService {
  const now = dependencies.now ?? (() => new Date());
  return {
    async edit(actorId, conversationId, messageId, input) {
      assertMessageText(input.text);
      return dependencies.store.withConversationTransaction(actorId, conversationId, async (transaction) => {
        const access = await transaction.getAccess(actorId, conversationId);
        assertPeerActivityAllowed(access);
        const message = await transaction.findMessage(conversationId, messageId);
        if (!message) throw new MessagingError("NOT_FOUND");
        if (message.senderId !== actorId) throw new MessagingError("FORBIDDEN");
        if (message.unsentAt) throw new MessagingError("CONFLICT");
        if (message.version !== input.expectedVersion) throw new MessagingError("VERSION_CONFLICT");
        // The exact cutoff is intentionally strict: at 15 minutes it is closed.
        if (!(now().getTime() < message.createdAt.getTime() + 15 * 60_000)) {
          throw new MessagingError("EDIT_WINDOW_EXPIRED");
        }
        const updated = await transaction.editMessage({
          messageId,
          body: input.text,
          editedAt: now(),
          expectedVersion: input.expectedVersion,
        });
        await transaction.appendPeerChange({ conversationId, messageId, kind: "message.edited" });
        return toMessageDto(updated);
      });
    },
  };
}

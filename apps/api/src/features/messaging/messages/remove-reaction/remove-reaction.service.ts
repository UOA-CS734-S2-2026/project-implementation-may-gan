import { assertPeerActivityAllowed } from "../../shared/conversation-access";
import { MessagingError } from "../../shared/messaging-error";
import { toMessageDto } from "../../shared/message-projection";
import type { MessageDto } from "../../shared/messaging-types";
import type { RemoveReactionStore } from "./remove-reaction.repository";

export interface RemoveReactionService {
  remove(actorId: string, conversationId: string, messageId: string): Promise<{ message: MessageDto; changed: boolean }>;
}

export function createRemoveReactionService(dependencies: { store: RemoveReactionStore }): RemoveReactionService {
  return {
    async remove(actorId, conversationId, messageId) {
      return dependencies.store.withConversationTransaction(actorId, conversationId, async (transaction) => {
        const access = await transaction.getAccess(actorId, conversationId);
        assertPeerActivityAllowed(access);
        const before = await transaction.findMessage(conversationId, messageId);
        if (!before) throw new MessagingError("NOT_FOUND");
        if (before.unsentAt) throw new MessagingError("CONFLICT");
        if (!before.reactions.some((summary) => summary.reactedByActor)) {
          return { message: toMessageDto(before), changed: false };
        }
        const updated = await transaction.removeReaction(messageId, actorId);
        await transaction.appendPeerChange({ conversationId, messageId, kind: "reaction.changed" });
        return { message: toMessageDto(updated), changed: true };
      });
    },
  };
}

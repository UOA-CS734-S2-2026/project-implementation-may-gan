import { assertPeerActivityAllowed } from "../../shared/conversation-access";
import { MessagingError } from "../../shared/messaging-error";
import { assertReactionKey } from "../../shared/message-validation";
import { toMessageDto } from "../../shared/message-projection";
import type { SetReactionStore } from "./set-reaction.repository";
import type { MessageDto, ReactionKey } from "../../shared/messaging-types";

export interface SetReactionService {
  set(actorId: string, conversationId: string, messageId: string, reaction: ReactionKey): Promise<{ message: MessageDto; changed: boolean }>;
}

export function createSetReactionService(dependencies: { store: SetReactionStore }): SetReactionService {
  return {
    async set(actorId, conversationId, messageId, reaction) {
      assertReactionKey(reaction);
      return dependencies.store.withConversationTransaction(actorId, conversationId, async (transaction) => {
        const access = await transaction.getAccess(actorId, conversationId);
        assertPeerActivityAllowed(access);
        const before = await transaction.findMessage(conversationId, messageId);
        if (!before) throw new MessagingError("NOT_FOUND");
        if (before.unsentAt) throw new MessagingError("CONFLICT");
        const own = before.reactions.find((summary) => summary.reactedByActor)?.reaction;
        if (own === reaction) return { message: toMessageDto(before), changed: false };
        const updated = await transaction.setReaction(messageId, actorId, reaction);
        await transaction.appendPeerChange({ conversationId, messageId, actorId, kind: "reaction.changed" });
        return { message: toMessageDto(updated), changed: true };
      });
    },
  };
}

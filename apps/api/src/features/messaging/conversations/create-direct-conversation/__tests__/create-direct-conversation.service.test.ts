import { describe, expect, it } from "vitest";
import {
  createCreateDirectConversationService,
  type DirectConversationStore,
  type DirectConversationTransaction,
} from "../create-direct-conversation.service";

function transaction(blocked: boolean): DirectConversationTransaction {
  return {
    isPairBlocked: async () => blocked,
    findDirectConversation: async () => null,
    recipientExists: async () => true,
    hasActiveFriendship: async () => false,
    findIdempotentMessage: async () => null,
    activateConversation: async (conversation) => ({ ...conversation, requestState: "active" }),
    createConversationWithMessage: async (input) => ({
      conversation: { id: input.conversationId, peerId: input.recipientId, requestState: input.requestState },
      message: { id: input.messageId, conversationId: input.conversationId, sequence: 1n, senderId: input.initiatorId, clientMessageId: input.clientMessageId, requestFingerprint: input.requestFingerprint, body: input.text, replyToMessageId: null, version: 1, createdAt: input.createdAt, editedAt: null, unsentAt: null, reactions: [] },
    }),
    appendExistingMessage: async () => { throw new Error("not reached"); },
  };
}

describe("create direct conversation", () => {
  it("checks either-direction blocks under the pair lock before creating a request", async () => {
    const store: DirectConversationStore = { withDirectTransaction: async (_actor, _recipient, action) => action(transaction(true)) };
    const service = createCreateDirectConversationService({ store, generateId: () => "id" });
    await expect(service.create("alice", { recipientId: "bob", clientMessageId: "client", text: "hello" }))
      .rejects.toMatchObject({ code: "BLOCKED" });
  });
});

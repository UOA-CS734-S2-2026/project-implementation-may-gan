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
    participantsAvailable: async () => true,
    hasActiveFriendship: async () => false,
    findIdempotentMessage: async () => null,
    lockNewMessageSender: async () => undefined,
    claimNewMessageSlot: async () => new Date("2026-09-28T04:50:00.000Z"),
    activateConversation: async (conversation) => ({ ...conversation, requestState: "active" }),
    createConversationWithMessage: async (input) => ({
      conversation: { id: input.conversationId, peerId: input.recipientId, requestState: input.requestState },
      message: { id: input.messageId, conversationId: input.conversationId, sequence: 1n, senderId: input.initiatorId, clientMessageId: input.clientMessageId, requestFingerprint: input.requestFingerprint, body: input.text, replyToMessageId: null, version: 1, createdAt: new Date(input.createdAt), editedAt: null, unsentAt: null, reactions: [] },
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

  it("claims quota only after accepted validation and before creating rows", async () => {
    const tx = transaction(false);
    const calls: string[] = [];
    tx.lockNewMessageSender = async () => { calls.push("lock"); };
    tx.claimNewMessageSlot = async (_senderId, limit) => {
      calls.push(`quota:${limit}`);
      return new Date("2026-09-28T04:50:00.000Z");
    };
    const originalCreate = tx.createConversationWithMessage;
    tx.createConversationWithMessage = async (input) => {
      calls.push("create");
      return originalCreate(input);
    };
    const store: DirectConversationStore = { withDirectTransaction: async (_actor, _recipient, action) => action(tx) };
    const service = createCreateDirectConversationService({ store, messageSendLimit: 7, generateId: () => "id" });
    await service.create("alice", { recipientId: "bob", clientMessageId: "client", text: "hello" });
    expect(calls).toEqual(["lock", "quota:7", "create"]);
  });
});

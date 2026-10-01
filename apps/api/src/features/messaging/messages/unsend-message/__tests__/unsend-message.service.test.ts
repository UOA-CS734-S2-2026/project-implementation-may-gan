import { describe, expect, it } from "vitest";
import { createUnsendMessageService } from "../unsend-message.service";
import { fixedMessageNow, message, messageMemory } from "../../../../../../test/support/messaging/message-test-fixtures";

describe("unsend message service", () => {
  it("unsends into a body-free tombstone and removes reactions", async () => {
    const state = messageMemory(message({ reactions: [{ reaction: "love", count: 1, reactedByActor: true, reactors: [{ id: "alice", name: "alice" }] }] }));
    const result = await createUnsendMessageService({ store: state.unsendStore, now: () => fixedMessageNow }).unsend("alice", "conversation-1", "message-1");
    expect(result).toMatchObject({ replayed: false, message: { text: null, unsentAt: fixedMessageNow.toISOString(), reactions: [] } });
    await expect(createUnsendMessageService({ store: state.unsendStore }).unsend("alice", "conversation-1", "message-1")).resolves.toMatchObject({ replayed: true });
  });

  it("allows the pending initiator to unsend the initial message", async () => {
    const state = messageMemory();
    state.transaction.getAccess = async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "pending", isMember: true, peerActivityBlocked: false });
    await expect(createUnsendMessageService({ store: state.unsendStore, now: () => fixedMessageNow }).unsend("alice", "conversation-1", "message-1")).resolves.toMatchObject({ replayed: false, message: { text: null } });
  });

  it("allows the author to unsend a declined request but never a blocked pair", async () => {
    const state = messageMemory();
    state.transaction.getAccess = async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "declined", isMember: true, peerActivityBlocked: false });
    await expect(createUnsendMessageService({ store: state.unsendStore, now: () => fixedMessageNow }).unsend("alice", "conversation-1", "message-1")).resolves.toMatchObject({ message: { text: null } });
    const blocked = messageMemory();
    blocked.transaction.getAccess = async () => ({ conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true, peerActivityBlocked: true });
    await expect(createUnsendMessageService({ store: blocked.unsendStore }).unsend("alice", "conversation-1", "message-1")).rejects.toMatchObject({ code: "BLOCKED" });
  });
});

import { describe, expect, it } from "vitest";
import { createRemoveReactionService } from "../remove-reaction.service";
import { message, messageMemory } from "../../../../../../test/support/messaging/message-test-fixtures";

describe("remove message reaction service", () => {
  it("removes an actor reaction and makes repeated removal a no-op", async () => {
    const state = messageMemory(message({ reactions: [{ reaction: "love", count: 1, reactedByActor: true, reactors: [{ id: "alice", name: "alice" }] }] }));
    const service = createRemoveReactionService({ store: state.removeReactionStore });
    await expect(service.remove("alice", "conversation-1", "message-1")).resolves.toMatchObject({ changed: true });
    await expect(service.remove("alice", "conversation-1", "message-1")).resolves.toMatchObject({ changed: false });
  });

  it("keeps an authorized removal available when the peer is unavailable", async () => {
    const state = messageMemory(message({ reactions: [{ reaction: "angry", count: 1, reactedByActor: true, reactors: [{ id: "alice", name: "alice" }] }] }));
    state.transaction.getAccess = async () => ({
      conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true,
      participantsAvailable: false, peerActivityBlocked: false,
    });
    await expect(createRemoveReactionService({ store: state.removeReactionStore })
      .remove("alice", "conversation-1", "message-1"))
      .resolves.toMatchObject({ changed: true, message: { reactions: [] } });
  });
});

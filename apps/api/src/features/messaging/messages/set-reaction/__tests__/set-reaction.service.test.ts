import { describe, expect, it } from "vitest";
import { createSetReactionService } from "../set-reaction.service";
import { messageMemory } from "../../../../../../test/support/messaging/message-test-fixtures";

describe("set message reaction service", () => {
  it("sets one reaction per actor and makes repeated sets no-ops", async () => {
    const state = messageMemory();
    const service = createSetReactionService({ store: state.setReactionStore });
    await expect(service.set("alice", "conversation-1", "message-1", "love")).resolves.toMatchObject({ changed: true });
    await expect(service.set("alice", "conversation-1", "message-1", "laugh")).resolves.toMatchObject({ changed: true, message: { reactions: [{ reaction: "laugh", count: 1, reactedByActor: true }] } });
    await expect(service.set("alice", "conversation-1", "message-1", "laugh")).resolves.toMatchObject({ changed: false });
  });

  it("does not add a reaction when either participant is unavailable", async () => {
    const state = messageMemory();
    state.transaction.getAccess = async () => ({
      conversationId: "conversation-1", peerId: "bob", requestState: "active", isMember: true,
      participantsAvailable: false, peerActivityBlocked: false,
    });
    await expect(createSetReactionService({ store: state.setReactionStore })
      .set("alice", "conversation-1", "message-1", "angry"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

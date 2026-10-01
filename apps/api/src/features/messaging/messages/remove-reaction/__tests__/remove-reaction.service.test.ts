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
});

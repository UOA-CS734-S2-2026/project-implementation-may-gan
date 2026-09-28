import { describe, expect, it, vi } from "vitest";
import { type RelationshipStore, type StoredRelationshipSnapshot } from "../shared/relationship-service";
import { sendFriendRequest } from "./send-friend-request.service";

const now = new Date("2026-09-22T00:00:00.000Z");
const snapshot: StoredRelationshipSnapshot = {
  actorId: "user_alice",
  subjectId: "user_bob",
  targetExists: true,
  blocks: { actorBlocksSubject: false, subjectBlocksActor: false },
  friendships: { actorToSubject: null, subjectToActor: null },
  requests: { incoming: null, outgoing: { id: "request-1", senderId: "user_alice", recipientId: "user_bob", createdAt: now.toISOString() } },
};

describe("sendFriendRequest", () => {
  it("uses the server clock and one store transaction", async () => {
    const sendRequest = vi.fn(async () => snapshot);
    const store: RelationshipStore = { withTransaction: async (operation) => operation({ sendRequest } as never) };

    await expect(sendFriendRequest({ store, now: () => now }, "user_alice", "user_bob")).resolves.toMatchObject({ status: "outgoing_pending" });
    expect(sendRequest).toHaveBeenCalledWith({ senderId: "user_alice", recipientId: "user_bob", createdAt: now.toISOString() });
  });
});

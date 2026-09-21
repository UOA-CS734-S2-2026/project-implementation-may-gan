import { describe, expect, it } from "vitest";
import {
  friendRequestStatus,
  friendRequests,
  friendships,
  friendshipState,
  relationshipBlocks,
} from "./relationships";

describe("relationship schema", () => {
  it("exports the paired friendship, durable request, and directional block projections", () => {
    expect(friendships).toBeDefined();
    expect(friendships.userId).toBeDefined();
    expect(friendships.friendId).toBeDefined();
    expect(friendRequests.id).toBeDefined();
    expect(friendRequests.createdAt).toBeDefined();
    expect(friendRequests.resolvedAt).toBeDefined();
    expect(relationshipBlocks.blockerId).toBeDefined();
    expect(relationshipBlocks.unblockedAt).toBeDefined();
    expect(friendshipState.enumValues).toEqual(["active", "ended"]);
    expect(friendRequestStatus.enumValues).toEqual(["pending", "accepted", "declined", "cancelled"]);
  });
});

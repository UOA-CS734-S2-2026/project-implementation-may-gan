import { describe, expect, it, vi } from "vitest";
import {
  deriveRelationshipAccess,
  deriveRelationshipState,
  hasActiveFriendship,
  RelationshipStoreError,
  type RelationshipStore,
  type RelationshipTransaction,
  type StoredRelationshipSnapshot,
} from "../relationship-service";
import { createRelationshipsService } from "../../../../app";

const fixedNow = new Date("2026-09-22T00:00:00.000Z");

function snapshot(overrides: Partial<StoredRelationshipSnapshot> = {}): StoredRelationshipSnapshot {
  return {
    actorId: "user_alice",
    subjectId: "user_bob",
    targetExists: true,
    blocks: { actorBlocksSubject: false, subjectBlocksActor: false },
    friendships: { actorToSubject: null, subjectToActor: null },
    requests: { incoming: null, outgoing: null },
    ...overrides,
  };
}

function activeRow(userId: string, friendId: string) {
  return { userId, friendId, state: "active" as const, stateChangedAt: fixedNow.toISOString() };
}

function pendingRequest(id: string, senderId: string, recipientId: string) {
  return { id, senderId, recipientId, createdAt: fixedNow.toISOString() };
}

function testStore(transaction: Partial<RelationshipTransaction>): RelationshipStore {
  return {
    withTransaction: vi.fn(async (operation) => operation(transaction as RelationshipTransaction)),
  };
}

describe("relationship state policy", () => {
  it("requires both legacy directional friendship rows to be active", () => {
    const oneSided = snapshot({ friendships: {
      actorToSubject: activeRow("user_alice", "user_bob"),
      subjectToActor: null,
    } });
    const paired = snapshot({ friendships: {
      actorToSubject: activeRow("user_alice", "user_bob"),
      subjectToActor: activeRow("user_bob", "user_alice"),
    } });

    expect(hasActiveFriendship(oneSided)).toBe(false);
    expect(deriveRelationshipState(oneSided)).toBe("none");
    expect(deriveRelationshipState(paired)).toBe("friends");
    expect(deriveRelationshipAccess(oneSided).canReadFriendsContent).toBe(false);
  });

  it("covers pending, active, ended, blocked, and unblocked states", () => {
    const outgoing = snapshot({ requests: {
      incoming: null,
      outgoing: pendingRequest("request-1", "user_alice", "user_bob"),
    } });
    const incoming = snapshot({ requests: {
      incoming: pendingRequest("request-2", "user_bob", "user_alice"),
      outgoing: null,
    } });
    const ended = snapshot({ friendships: {
      actorToSubject: { ...activeRow("user_alice", "user_bob"), state: "ended", stateChangedAt: fixedNow.toISOString() },
      subjectToActor: { ...activeRow("user_bob", "user_alice"), state: "ended", stateChangedAt: fixedNow.toISOString() },
    } });
    const blocked = snapshot({
      blocks: { actorBlocksSubject: true, subjectBlocksActor: false },
      requests: { incoming: pendingRequest("stale", "user_bob", "user_alice"), outgoing: pendingRequest("stale-2", "user_alice", "user_bob") },
    });

    expect(deriveRelationshipState(outgoing)).toBe("outgoing_pending");
    expect(deriveRelationshipState(incoming)).toBe("incoming_pending");
    expect(deriveRelationshipState(ended)).toBe("none");
    expect(deriveRelationshipState(blocked)).toBe("blocked");
    expect(deriveRelationshipState(snapshot())).toBe("none");
    expect(deriveRelationshipAccess(ended)).toMatchObject({
      canReadFriendsContent: false,
      canPerformFriendInteractions: false,
      newMessageActivityBlocked: false,
      directMessageHistory: "requires_thread_membership_check",
    });
    expect(deriveRelationshipAccess(blocked).newMessageActivityBlocked).toBe(true);
    expect(deriveRelationshipAccess(blocked).directMessageHistory).toBe("requires_thread_membership_check");
  });

  it("treats a legacy crossed-request read as incoming-only, never as a reachable state", () => {
    const legacyCorruption = snapshot({ requests: {
      incoming: pendingRequest("request-in", "user_bob", "user_alice"),
      outgoing: pendingRequest("request-out", "user_alice", "user_bob"),
    } });
    expect(deriveRelationshipState(legacyCorruption)).toBe("incoming_pending");

    const accepted = snapshot({ friendships: {
      actorToSubject: activeRow("user_alice", "user_bob"),
      subjectToActor: activeRow("user_bob", "user_alice"),
    } });
    const transaction = {
      acceptRequest: vi.fn(async () => accepted),
    } satisfies Partial<RelationshipTransaction>;
    const service = createRelationshipsService(testStore(transaction), { now: () => fixedNow });

    return expect(service.acceptRequest("user_alice", "request-in")).resolves.toMatchObject({
      status: "friends",
      incomingRequest: null,
      outgoingRequest: null,
    });
  });

  it("rejects a reverse send without transition, then explicitly accepts the original request", async () => {
    const incoming = snapshot({ requests: {
      incoming: pendingRequest("request-a-to-b", "user_alice", "user_bob"),
      outgoing: null,
    } });
    const active = snapshot({
      friendships: {
        actorToSubject: activeRow("user_bob", "user_alice"),
        subjectToActor: activeRow("user_alice", "user_bob"),
      },
      requests: { incoming: null, outgoing: null },
    });
    const sendRequest = vi.fn(async () => {
      throw new RelationshipStoreError("REQUEST_EXISTS");
    });
    const acceptRequest = vi.fn(async () => active);
    const service = createRelationshipsService(testStore({ sendRequest, acceptRequest }), { now: () => fixedNow });

    await expect(service.sendRequest("user_bob", "user_alice")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(acceptRequest).not.toHaveBeenCalled();

    await expect(service.acceptRequest("user_bob", "request-a-to-b")).resolves.toMatchObject({ status: "friends" });
    expect(acceptRequest).toHaveBeenCalledWith({
      requestId: "request-a-to-b",
      recipientId: "user_bob",
      acceptedAt: fixedNow.toISOString(),
    });
    expect(incoming.requests.incoming?.id).toBe("request-a-to-b");
  });
});

describe("relationship service transaction boundary", () => {
  it("passes the authenticated actor and server timestamp into an atomic send", async () => {
    const outgoing = snapshot({ requests: {
      incoming: null,
      outgoing: pendingRequest("request-1", "user_alice", "user_bob"),
    } });
    const sendRequest = vi.fn(async () => outgoing);
    const service = createRelationshipsService(testStore({ sendRequest }), { now: () => fixedNow });

    await expect(service.sendRequest("user_alice", "user_bob")).resolves.toMatchObject({ status: "outgoing_pending" });
    expect(sendRequest).toHaveBeenCalledWith({
      senderId: "user_alice",
      recipientId: "user_bob",
      createdAt: fixedNow.toISOString(),
    });
  });

  it("allows the service to return an immediate re-request outcome; persistence enforces the rolling limit", async () => {
    const declinedThenResent = snapshot({ requests: {
      incoming: null,
      outgoing: pendingRequest("request-2", "user_alice", "user_bob"),
    } });
    const sendRequest = vi.fn(async () => declinedThenResent);
    const service = createRelationshipsService(testStore({ sendRequest }), { now: () => fixedNow });

    await expect(service.sendRequest("user_alice", "user_bob")).resolves.toMatchObject({
      outgoingRequest: { id: "request-2" },
    });
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  it("maps the persistent rolling throttle without exposing store details", async () => {
    const sendRequest = vi.fn(async () => {
      throw new RelationshipStoreError("THROTTLED", { retryAfterSeconds: 1_234 });
    });
    const service = createRelationshipsService(testStore({ sendRequest }), { now: () => fixedNow });

    await expect(service.sendRequest("user_alice", "user_bob")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Too many relationship requests were sent recently.",
      retryAfterSeconds: 1_234,
    });
  });

  it("passes block and unblock through the atomic store without restoring access", async () => {
    const blocked = snapshot({
      blocks: { actorBlocksSubject: true, subjectBlocksActor: false },
      friendships: {
        actorToSubject: { ...activeRow("user_alice", "user_bob"), state: "ended" },
        subjectToActor: { ...activeRow("user_bob", "user_alice"), state: "ended" },
      },
      requests: { incoming: null, outgoing: null },
    });
    const unblocked = snapshot({
      friendships: {
        actorToSubject: { ...activeRow("user_alice", "user_bob"), state: "ended" },
        subjectToActor: { ...activeRow("user_bob", "user_alice"), state: "ended" },
      },
    });
    const block = vi.fn(async () => blocked);
    const unblock = vi.fn(async () => unblocked);
    const service = createRelationshipsService(testStore({ block, unblock }), { now: () => fixedNow });

    await expect(service.block("user_alice", "user_bob")).resolves.toMatchObject({ status: "blocked" });
    expect(block).toHaveBeenCalledWith({
      blockerId: "user_alice",
      blockedId: "user_bob",
      blockedAt: fixedNow.toISOString(),
    });
    await expect(service.unblock("user_alice", "user_bob")).resolves.toMatchObject({ status: "none" });
    expect(unblock).toHaveBeenCalledWith({
      actorId: "user_alice",
      subjectId: "user_bob",
      unblockedAt: fixedNow.toISOString(),
    });
  });

  it("conceals blocked targets from relationship status reads", async () => {
    const getSnapshot = vi.fn(async () => snapshot({
      blocks: { actorBlocksSubject: false, subjectBlocksActor: true },
      requests: {
        incoming: pendingRequest("leaked-in", "user_bob", "user_alice"),
        outgoing: pendingRequest("leaked-out", "user_alice", "user_bob"),
      },
    }));
    const service = createRelationshipsService(testStore({ getSnapshot }), { now: () => fixedNow });

    await expect(service.getStatus("user_alice", "user_bob")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

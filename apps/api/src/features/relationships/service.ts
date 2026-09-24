export type RelationshipState = "none" | "outgoing_pending" | "incoming_pending" | "friends" | "blocked";

export interface PendingRelationshipRequest {
  id: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
}

export interface RelationshipStatus {
  userId: string;
  status: RelationshipState;
  incomingRequest: PendingRelationshipRequest | null;
  outgoingRequest: PendingRelationshipRequest | null;
}

export interface PendingRequestPage {
  items: PendingRelationshipRequest[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type FriendshipRowState = "active" | "ended";

export interface StoredFriendshipRow {
  userId: string;
  friendId: string;
  state: FriendshipRowState;
  stateChangedAt: string;
}

export interface StoredPendingRequest {
  id: string;
  senderId: string;
  recipientId: string;
  createdAt: string;
}

/**
 * A read model returned by the repository. The two friendship rows are
 * intentionally directional so a database implementation can preserve the
 * legacy composite keys and require both rows to be active.
 */
export interface StoredRelationshipSnapshot {
  actorId: string;
  subjectId: string;
  targetExists: boolean;
  blocks: {
    actorBlocksSubject: boolean;
    subjectBlocksActor: boolean;
  };
  friendships: {
    actorToSubject: StoredFriendshipRow | null;
    subjectToActor: StoredFriendshipRow | null;
  };
  requests: {
    incoming: StoredPendingRequest | null;
    outgoing: StoredPendingRequest | null;
  };
}

export type PendingRequestDirection = "incoming" | "outgoing" | "all";

export interface RelationshipTransaction {
  getSnapshot(actorId: string, subjectId: string): Promise<StoredRelationshipSnapshot>;
  listPendingRequests(
    actorId: string,
    direction: PendingRequestDirection,
    limit: number,
    cursor?: string,
  ): Promise<PendingRequestPage>;

  /**
   * Must lock the canonical unordered participant pair, reject blocks and
   * every pending request in either direction, and atomically count persistent
   * sends for this sender-recipient pair in the rolling 24-hour window before
   * inserting the new request. A
   * declined or cancelled request must not prevent an immediate re-request
   * unless the rolling limit is reached. This exclusivity is what prevents a
   * reverse send from becoming a crossed request or an implicit acceptance.
   */
  sendRequest(input: { senderId: string; recipientId: string; createdAt: string }): Promise<StoredRelationshipSnapshot>;

  /** Accept both friendship directions atomically and resolve crossed pending state. */
  acceptRequest(input: { requestId: string; recipientId: string; acceptedAt: string }): Promise<StoredRelationshipSnapshot>;

  declineRequest(input: { requestId: string; recipientId: string; declinedAt: string }): Promise<StoredRelationshipSnapshot>;
  cancelRequest(input: { requestId: string; senderId: string; cancelledAt: string }): Promise<StoredRelationshipSnapshot>;

  /** End both directional friendship rows in one transaction. */
  removeFriendship(input: { actorId: string; subjectId: string; endedAt: string }): Promise<StoredRelationshipSnapshot>;

  /** Cancel pending requests and end both friendship rows atomically. */
  block(input: { blockerId: string; blockedId: string; blockedAt: string }): Promise<StoredRelationshipSnapshot>;
  unblock(input: { actorId: string; subjectId: string; unblockedAt: string }): Promise<StoredRelationshipSnapshot>;
}

export interface RelationshipStore {
  /** Every operation runs inside one store-owned transaction boundary. */
  withTransaction<T>(operation: (transaction: RelationshipTransaction) => Promise<T>): Promise<T>;
}

export const relationshipStoreErrorCodes = [
  "TARGET_NOT_FOUND",
  "REQUEST_NOT_FOUND",
  "FORBIDDEN",
  "BLOCKED",
  "ALREADY_FRIENDS",
  "REQUEST_EXISTS",
  "INVALID_STATE",
  "INVALID_CURSOR",
  "SELF_RELATIONSHIP",
  "VALIDATION_FAILED",
  "THROTTLED",
] as const;

export type RelationshipStoreErrorCode = (typeof relationshipStoreErrorCodes)[number];

export class RelationshipStoreError extends Error {
  readonly code: RelationshipStoreErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: RelationshipStoreErrorCode, options?: { retryAfterSeconds?: number }) {
    super(code);
    this.name = "RelationshipStoreError";
    this.code = code;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export const relationshipServiceErrorCodes = [
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "RATE_LIMITED",
  "SELF_RELATIONSHIP",
  "VALIDATION_FAILED",
] as const;

export type RelationshipServiceErrorCode = (typeof relationshipServiceErrorCodes)[number];

export class RelationshipServiceError extends Error {
  readonly code: RelationshipServiceErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: RelationshipServiceErrorCode, message: string, options?: { retryAfterSeconds?: number }) {
    super(message);
    this.name = "RelationshipServiceError";
    this.code = code;
    this.retryAfterSeconds = options?.retryAfterSeconds;
  }
}

export interface RelationshipAccessPolicy {
  canReadFriendsContent: boolean;
  canPerformFriendInteractions: boolean;
  newMessageActivityBlocked: boolean;
  /**
   * Direct-message history is intentionally outside relationship policy.
   * A conversation/thread authorization service must check membership before
   * deciding whether existing history is readable; a block alone must not
   * erase access for existing thread participants.
   */
  directMessageHistory: "requires_thread_membership_check";
}

/** Both directional rows must be active before friendship access is granted. */
export function hasActiveFriendship(snapshot: StoredRelationshipSnapshot): boolean {
  return snapshot.friendships.actorToSubject?.state === "active"
    && snapshot.friendships.subjectToActor?.state === "active";
}

export function deriveRelationshipState(snapshot: StoredRelationshipSnapshot): RelationshipState {
  if (snapshot.blocks.actorBlocksSubject || snapshot.blocks.subjectBlocksActor) return "blocked";
  if (hasActiveFriendship(snapshot)) return "friends";

  const hasIncoming = snapshot.requests.incoming !== null;
  const hasOutgoing = snapshot.requests.outgoing !== null;
  // The store contract makes both true unreachable. Prefer the incoming
  // request defensively if a legacy/corrupt read ever violates that invariant;
  // this is not a supported public state.
  if (hasIncoming) return "incoming_pending";
  if (hasOutgoing) return "outgoing_pending";
  return "none";
}

export function deriveRelationshipAccess(snapshot: StoredRelationshipSnapshot): RelationshipAccessPolicy {
  const state = deriveRelationshipState(snapshot);
  return {
    canReadFriendsContent: state === "friends",
    canPerformFriendInteractions: state === "friends",
    newMessageActivityBlocked: state === "blocked",
    directMessageHistory: "requires_thread_membership_check",
  };
}

function mapStoreError(error: unknown): never {
  if (!(error instanceof RelationshipStoreError)) throw error;

  switch (error.code) {
    case "TARGET_NOT_FOUND":
    case "REQUEST_NOT_FOUND":
      throw new RelationshipServiceError("NOT_FOUND", "The requested relationship resource was not found.");
    case "FORBIDDEN":
      throw new RelationshipServiceError("FORBIDDEN", "The relationship operation is not permitted.");
    case "BLOCKED":
      throw new RelationshipServiceError("FORBIDDEN", "The relationship operation is not permitted.");
    case "THROTTLED":
      throw new RelationshipServiceError("RATE_LIMITED", "Too many relationship requests were sent recently.", {
        retryAfterSeconds: error.retryAfterSeconds,
      });
    case "SELF_RELATIONSHIP":
      throw new RelationshipServiceError("SELF_RELATIONSHIP", "A relationship target must be another user.");
    case "INVALID_CURSOR":
      throw new RelationshipServiceError("VALIDATION_FAILED", "The pagination cursor is invalid.");
    case "ALREADY_FRIENDS":
    case "REQUEST_EXISTS":
    case "INVALID_STATE":
      throw new RelationshipServiceError("CONFLICT", "The relationship is in a conflicting state.");
    default:
      throw error;
  }
}

function assertDifferentUsers(actorId: string, subjectId: string) {
  if (actorId === subjectId) {
    throw new RelationshipServiceError("SELF_RELATIONSHIP", "A relationship target must be another user.");
  }
}

function toPendingRequest(request: StoredPendingRequest | null): PendingRelationshipRequest | null {
  return request;
}

export function toRelationshipStatus(
  snapshot: StoredRelationshipSnapshot,
  options: { concealBlocked?: boolean } = {},
): RelationshipStatus {
  const blocked = snapshot.blocks.actorBlocksSubject || snapshot.blocks.subjectBlocksActor;
  if (!snapshot.targetExists || (options.concealBlocked && blocked)) {
    throw new RelationshipServiceError("NOT_FOUND", "The requested relationship resource was not found.");
  }

  const incomingRequest = blocked ? null : toPendingRequest(snapshot.requests.incoming);
  // Unordered-pair pending exclusivity makes this branch unreachable for a
  // valid store. Suppress the reverse row if defensive projection sees both.
  const outgoingRequest = blocked || incomingRequest ? null : toPendingRequest(snapshot.requests.outgoing);

  return {
    userId: snapshot.subjectId,
    status: blocked ? "blocked" : deriveRelationshipState(snapshot),
    // A block is a privacy boundary even if a repository implementation has
    // not yet repaired stale request rows in the same read.
    incomingRequest,
    outgoingRequest,
  };
}

export interface RelationshipsService {
  getStatus(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  listPendingRequests(
    actorId: string,
    direction: PendingRequestDirection,
    limit: number,
    cursor?: string,
  ): Promise<PendingRequestPage>;
  sendRequest(actorId: string, recipientId: string): Promise<RelationshipStatus>;
  acceptRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  declineRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  cancelRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  removeFriendship(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  block(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  unblock(actorId: string, subjectId: string): Promise<RelationshipStatus>;
}

export function createRelationshipsService(
  store: RelationshipStore,
  options: { now?: () => Date } = {},
): RelationshipsService {
  const now = options.now ?? (() => new Date());
  const timestamp = () => now().toISOString();

  async function inTransaction<T>(operation: (transaction: RelationshipTransaction) => Promise<T>): Promise<T> {
    try {
      return await store.withTransaction(operation);
    } catch (error) {
      return mapStoreError(error);
    }
  }

  return {
    async getStatus(actorId, subjectId) {
      assertDifferentUsers(actorId, subjectId);
      return toRelationshipStatus(
        await inTransaction((transaction) => transaction.getSnapshot(actorId, subjectId)),
        { concealBlocked: true },
      );
    },

    async listPendingRequests(actorId, direction, limit, cursor) {
      return inTransaction((transaction) => transaction.listPendingRequests(actorId, direction, limit, cursor));
    },

    async sendRequest(actorId, recipientId) {
      assertDifferentUsers(actorId, recipientId);
      const snapshot = await inTransaction((transaction) => transaction.sendRequest({
        senderId: actorId,
        recipientId,
        createdAt: timestamp(),
      }));
      return toRelationshipStatus(snapshot);
    },

    async acceptRequest(actorId, requestId) {
      const snapshot = await inTransaction((transaction) => transaction.acceptRequest({
        requestId,
        recipientId: actorId,
        acceptedAt: timestamp(),
      }));
      return toRelationshipStatus(snapshot);
    },

    async declineRequest(actorId, requestId) {
      const snapshot = await inTransaction((transaction) => transaction.declineRequest({
        requestId,
        recipientId: actorId,
        declinedAt: timestamp(),
      }));
      return toRelationshipStatus(snapshot);
    },

    async cancelRequest(actorId, requestId) {
      const snapshot = await inTransaction((transaction) => transaction.cancelRequest({
        requestId,
        senderId: actorId,
        cancelledAt: timestamp(),
      }));
      return toRelationshipStatus(snapshot);
    },

    async removeFriendship(actorId, subjectId) {
      assertDifferentUsers(actorId, subjectId);
      const snapshot = await inTransaction((transaction) => transaction.removeFriendship({
        actorId,
        subjectId,
        endedAt: timestamp(),
      }));
      return toRelationshipStatus(snapshot);
    },

    async block(actorId, subjectId) {
      assertDifferentUsers(actorId, subjectId);
      const snapshot = await inTransaction((transaction) => transaction.block({
        blockerId: actorId,
        blockedId: subjectId,
        blockedAt: timestamp(),
      }));
      return toRelationshipStatus(snapshot);
    },

    async unblock(actorId, subjectId) {
      assertDifferentUsers(actorId, subjectId);
      const snapshot = await inTransaction((transaction) => transaction.unblock({
        actorId,
        subjectId,
        unblockedAt: timestamp(),
      }));
      return toRelationshipStatus(snapshot);
    },
  };
}

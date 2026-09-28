import { acceptFriendRequest } from "./accept-friend-request/accept-friend-request.service";
import { blockUser } from "./block-user/block-user.service";
import { cancelFriendRequest } from "./cancel-friend-request/cancel-friend-request.service";
import { declineFriendRequest } from "./decline-friend-request/decline-friend-request.service";
import { getRelationship } from "./get-relationship/get-relationship.service";
import { listFriendRequests } from "./list-friend-requests/list-friend-requests.service";
import { listFriends } from "./list-friends/list-friends.service";
import { searchUsers } from "./search-users/search-users.service";
import { removeFriendship } from "./remove-friendship/remove-friendship.service";
import { sendFriendRequest } from "./send-friend-request/send-friend-request.service";
import { unblockUser } from "./unblock-user/unblock-user.service";
import type {
  PendingRequestDirection,
  PendingRequestPage,
  RelationshipStore,
  RelationshipUserPage,
  RelationshipStatus,
} from "./shared/relationship-service";

export {
  RelationshipServiceError,
  RelationshipStoreError,
  type PendingRequestDirection,
  type PendingRequestPage,
  type RelationshipStore,
  type RelationshipUserPage,
  type RelationshipTransaction,
  type StoredRelationshipSnapshot,
} from "./shared/relationship-service";

/** Composition facade for existing app wiring. Action modules own the operations. */
export interface RelationshipsService {
  getStatus(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  listPendingRequests(actorId: string, direction: PendingRequestDirection, limit: number, cursor?: string): Promise<PendingRequestPage>;
  listFriends(actorId: string, limit: number, cursor?: string): Promise<RelationshipUserPage>;
  searchUsers(actorId: string, query: string, limit: number, cursor?: string): Promise<RelationshipUserPage>;
  sendRequest(actorId: string, recipientId: string): Promise<RelationshipStatus>;
  acceptRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  declineRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  cancelRequest(actorId: string, requestId: string): Promise<RelationshipStatus>;
  removeFriendship(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  block(actorId: string, subjectId: string): Promise<RelationshipStatus>;
  unblock(actorId: string, subjectId: string): Promise<RelationshipStatus>;
}

export function createRelationshipsService(store: RelationshipStore, options: { now?: () => Date } = {}): RelationshipsService {
  const dependencies = { store, now: options.now ?? (() => new Date()) };
  return {
    getStatus: (actorId, subjectId) => getRelationship(dependencies, actorId, subjectId),
    listPendingRequests: (actorId, direction, limit, cursor) => listFriendRequests(dependencies, actorId, direction, limit, cursor),
    listFriends: (actorId, limit, cursor) => listFriends(dependencies, actorId, limit, cursor),
    searchUsers: (actorId, query, limit, cursor) => searchUsers(dependencies, actorId, query, limit, cursor),
    sendRequest: (actorId, recipientId) => sendFriendRequest(dependencies, actorId, recipientId),
    acceptRequest: (actorId, requestId) => acceptFriendRequest(dependencies, actorId, requestId),
    declineRequest: (actorId, requestId) => declineFriendRequest(dependencies, actorId, requestId),
    cancelRequest: (actorId, requestId) => cancelFriendRequest(dependencies, actorId, requestId),
    removeFriendship: (actorId, subjectId) => removeFriendship(dependencies, actorId, subjectId),
    block: (actorId, subjectId) => blockUser(dependencies, actorId, subjectId),
    unblock: (actorId, subjectId) => unblockUser(dependencies, actorId, subjectId),
  };
}

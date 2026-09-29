import { acceptFriendRequest } from "../src/features/relationships/accept-friend-request/accept-friend-request.service";
import { blockUser } from "../src/features/relationships/block-user/block-user.service";
import { cancelFriendRequest } from "../src/features/relationships/cancel-friend-request/cancel-friend-request.service";
import { declineFriendRequest } from "../src/features/relationships/decline-friend-request/decline-friend-request.service";
import { getRelationship } from "../src/features/relationships/get-relationship/get-relationship.service";
import { listFriendRequests } from "../src/features/relationships/list-friend-requests/list-friend-requests.service";
import { listFriends } from "../src/features/relationships/list-friends/list-friends.service";
import { removeFriendship } from "../src/features/relationships/remove-friendship/remove-friendship.service";
import { searchUsers } from "../src/features/relationships/search-users/search-users.service";
import { sendFriendRequest } from "../src/features/relationships/send-friend-request/send-friend-request.service";
import { unblockUser } from "../src/features/relationships/unblock-user/unblock-user.service";
import type { RelationshipsService } from "../src/features/relationships/shared/relationship-route";
import type { RelationshipStore } from "../src/features/relationships/shared/relationship-service";

export function createRelationshipsService(
  store: RelationshipStore,
  options: { now?: () => Date } = {},
): RelationshipsService {
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

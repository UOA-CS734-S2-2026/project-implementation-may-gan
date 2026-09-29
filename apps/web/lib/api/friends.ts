import {
  FetchError,
  RelationshipsApi,
  ResponseError,
  type PendingRelationshipRequest,
  type RelationshipUserCard,
  type RelationshipUserPage,
  type RelationshipProfile,
} from "@dayli/api-client";
import { apiConfiguration } from "./config";

export type FriendCard = RelationshipUserCard;
export type FriendRequest = PendingRelationshipRequest;
export type FriendsFailure = "unauthenticated" | "network" | "unavailable" | "rateLimited" | "conflict";
export type FriendsResult<T> = { ok: true; value: T } | { ok: false; failure: FriendsFailure };

async function call<T>(operation: (api: RelationshipsApi) => Promise<T>): Promise<FriendsResult<T>> {
  const configuration = apiConfiguration();
  if (!configuration) return { ok: false, failure: "unavailable" };
  try {
    return { ok: true, value: await operation(new RelationshipsApi(configuration)) };
  } catch (error) {
    if (error instanceof ResponseError) {
      if (error.response.status === 401) return { ok: false, failure: "unauthenticated" };
      if (error.response.status === 429) return { ok: false, failure: "rateLimited" };
      if (error.response.status === 409) return { ok: false, failure: "conflict" };
      return { ok: false, failure: "unavailable" };
    }
    return { ok: false, failure: error instanceof FetchError || error instanceof TypeError ? "network" : "unavailable" };
  }
}

export function loadFriends(cursor?: string) {
  return call((api) => api.relationshipsListFriends({ limit: 20, cursor }, { cache: "no-store" }));
}

export function loadRequests(direction: "incoming" | "outgoing", cursor?: string) {
  return call((api) => api.relationshipsListPendingRequests({ direction, limit: 20, cursor }, { cache: "no-store" }));
}

export function searchFriends(query: string, cursor?: string) {
  return call((api) => api.relationshipsSearchUsers({ q: query, limit: 20, cursor }, { cache: "no-store" }));
}

export function loadSocialProfile(username: string) {
  return call((api) => api.relationshipsGetProfileByUsername({ username }, { cache: "no-store" }));
}

export function getRelationship(userId: string) {
  return call((api) => api.relationshipsGetStatus({ userId }, { cache: "no-store" }));
}

export function sendFriendRequest(recipientId: string) {
  return call((api) => api.relationshipsSendRequest({ sendRelationshipRequest: { recipientId } }));
}

export function acceptFriendRequest(requestId: string) {
  return call((api) => api.relationshipsAcceptRequest({ requestId }));
}

export function declineFriendRequest(requestId: string) {
  return call((api) => api.relationshipsDeclineRequest({ requestId }));
}

export function cancelFriendRequest(requestId: string) {
  return call((api) => api.relationshipsCancelRequest({ requestId }));
}

export function removeFriend(userId: string) {
  return call((api) => api.relationshipsRemoveFriendship({ userId }));
}

export type { RelationshipUserPage, RelationshipProfile };

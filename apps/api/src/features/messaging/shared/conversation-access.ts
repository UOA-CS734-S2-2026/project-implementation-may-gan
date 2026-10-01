import { MessagingError } from "./messaging-error";
import type { ConversationAccess } from "./messaging-types";

/**
 * Keep policy checks inside the transaction that resolved access. The store
 * contract requires pair locking before this snapshot and conversation locking
 * before any mutable message operation.
 */
export function assertConversationMember(access: ConversationAccess): void {
  if (!access.isMember) throw new MessagingError("NOT_FOUND");
}

export function assertPeerActivityAllowed(access: ConversationAccess): void {
  assertConversationMember(access);
  if (access.peerActivityBlocked) throw new MessagingError("BLOCKED");
  if (access.requestState === "pending") throw new MessagingError("PENDING");
  if (access.requestState === "declined") throw new MessagingError("DECLINED");
}

/** Pending initiators may only unsend their own initial message. Other new peer activity remains blocked. */
export function assertUnsendAllowed(access: ConversationAccess): void {
  assertConversationMember(access);
  // A deletion-pending peer must not prevent the owner withdrawing their own
  // message. A real relationship block still retains its existing behavior.
  if (access.peerActivityBlocked && !access.peerUnavailable) throw new MessagingError("BLOCKED");
}

/** Removing an existing own reaction is a privacy revocation, not new activity. */
export function assertReactionRemovalAllowed(access: ConversationAccess): void {
  assertUnsendAllowed(access);
}

export function assertPendingRecipient(access: ConversationAccess, actorId: string): void {
  assertConversationMember(access);
  if (access.peerActivityBlocked) throw new MessagingError("BLOCKED");
  if (access.requestState !== "pending" || access.peerId !== actorId) throw new MessagingError("FORBIDDEN");
}

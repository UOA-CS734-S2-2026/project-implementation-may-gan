export type ConversationRequestState = "pending" | "active" | "declined";
export type ReactionKey = "like" | "love" | "laugh" | "surprised" | "sad" | "thanks";

export interface MessageReactionSummary {
  reaction: ReactionKey;
  count: number;
  reactedByActor: boolean;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  sequence: bigint;
  senderId: string;
  clientMessageId: string;
  requestFingerprint: string;
  body: string | null;
  replyToMessageId: string | null;
  version: number;
  createdAt: Date;
  editedAt: Date | null;
  unsentAt: Date | null;
  reactions: MessageReactionSummary[];
}

/** A transaction-local access result, resolved after pair then conversation locking. */
export interface ConversationAccess {
  conversationId: string;
  peerId: string;
  requestState: ConversationRequestState;
  isMember: boolean;
  /** True when the peer has requested deletion or is a deleted stable participant. */
  peerUnavailable?: boolean;
  /** True when either participant blocks the other or the peer is unavailable. */
  peerActivityBlocked: boolean;
}

export interface ConversationPeerChange {
  conversationId: string;
  messageId: string | null;
  kind: "message.created" | "message.edited" | "message.unsent" | "reaction.changed" | "request.active";
}

export interface MessageReplyPreview {
  id: string;
  senderId: string;
  text: string | null;
  unsentAt: string | null;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  sequence: string;
  senderId: string;
  clientMessageId: string;
  text: string | null;
  replyToMessageId: string | null;
  replyPreview: MessageReplyPreview | null;
  version: number;
  createdAt: string;
  editedAt: string | null;
  unsentAt: string | null;
  reactions: MessageReactionSummary[];
}

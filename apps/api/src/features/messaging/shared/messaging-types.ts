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
  /** True when either participant currently blocks the other. */
  peerActivityBlocked: boolean;
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

export type ConversationRequestState = "pending" | "active" | "declined";
export type ReactionKey = "like" | "love" | "laugh" | "surprised" | "sad" | "angry" | "thanks";

export interface MessageReactionSummary {
  reaction: ReactionKey;
  count: number;
  reactedByActor: boolean;
  reactors: Array<{ id: string; name: string }>;
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
  /** Durable identity for the authenticated member, resolved under the pair lock. */
  actorParticipantId?: string;
  requestState: ConversationRequestState;
  isMember: boolean;
  /** Both rows still map to active participants with an active lifecycle. */
  participantsAvailable: boolean;
  /** True when either participant currently blocks the other. */
  peerActivityBlocked: boolean;
}

export interface ConversationPeerChange {
  conversationId: string;
  messageId: string | null;
  /** The actual mutation actor. Older queued rows may lack this legacy field. */
  actorId?: string;
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

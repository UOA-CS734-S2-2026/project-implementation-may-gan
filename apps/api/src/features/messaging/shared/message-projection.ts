import type { MessageDto, MessageReplyPreview, StoredMessage } from "./messaging-types";

/**
 * Canonical projection. Tombstones expose stable ordering metadata but never a
 * former body or copied reply text.
 */
export function toMessageDto(message: StoredMessage, parent?: StoredMessage | null): MessageDto {
  const replyPreview: MessageReplyPreview | null = message.replyToMessageId && parent
    ? {
        id: parent.id,
        senderId: parent.senderId,
        text: parent.unsentAt ? null : parent.body,
        unsentAt: parent.unsentAt?.toISOString() ?? null,
      }
    : null;
  return {
    id: message.id,
    conversationId: message.conversationId,
    sequence: message.sequence.toString(),
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    text: message.unsentAt ? null : message.body,
    replyToMessageId: message.replyToMessageId,
    replyPreview,
    version: message.version,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    unsentAt: message.unsentAt?.toISOString() ?? null,
    reactions: message.unsentAt ? [] : message.reactions,
  };
}

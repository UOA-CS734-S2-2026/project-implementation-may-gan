export interface VersionedMessage {
  id: string;
  version: number;
  sequence: string;
  unsentAt: string | null;
}

/** Merge REST pages and invalidation fetches without reviving stale text. */
export function mergeMessages<T extends VersionedMessage>(current: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const previous = byId.get(message.id);
    if (!previous || message.version >= previous.version) byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => {
    const a = BigInt(left.sequence); const b = BigInt(right.sequence);
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

export interface ReplyPreviewMessage extends VersionedMessage {
  text: string | null;
  replyToMessageId: string | null;
  replyPreview: { id: string; senderId: string; text: string | null; unsentAt: string | null } | null;
}

/** Parent edits and tombstones are authoritative for every loaded reply preview. */
export function reconcileReplyPreviews<T extends ReplyPreviewMessage>(messages: readonly T[]): T[] {
  const parents = new Map(messages.map((message) => [message.id, message]));
  return messages.map((message) => {
    const parent = message.replyToMessageId ? parents.get(message.replyToMessageId) : undefined;
    if (!parent || !message.replyPreview) return message;
    const text = parent.unsentAt ? null : parent.text;
    if (message.replyPreview.text === text && message.replyPreview.unsentAt === parent.unsentAt) return message;
    return { ...message, replyPreview: { ...message.replyPreview, text, unsentAt: parent.unsentAt } };
  });
}

export function shouldReconcileChange(lastChangeSequence: string | null, eventSequence: string): boolean {
  return lastChangeSequence === null || BigInt(eventSequence) > BigInt(lastChangeSequence);
}

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

export function shouldReconcileChange(lastChangeSequence: string | null, eventSequence: string): boolean {
  return lastChangeSequence === null || BigInt(eventSequence) > BigInt(lastChangeSequence);
}

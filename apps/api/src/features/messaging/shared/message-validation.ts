import { MessagingError } from "./messaging-error";
import type { ReactionKey } from "./messaging-types";

export const maxMessageCodePoints = 4_000;
export const reactionKeys = ["like", "love", "laugh", "surprised", "sad", "thanks"] as const satisfies readonly ReactionKey[];

/**
 * Message text stays plain text. Whitespace-only values are rejected, while
 * meaningful leading, trailing, and interior whitespace remain untouched.
 */
export function assertMessageText(text: string): void {
  if (Array.from(text).length < 1 || Array.from(text).length > maxMessageCodePoints || text.trim().length === 0) {
    throw new MessagingError("VALIDATION_FAILED");
  }
}

export function assertReactionKey(reaction: string): asserts reaction is ReactionKey {
  if (!(reactionKeys as readonly string[]).includes(reaction)) throw new MessagingError("REACTION_NOT_ALLOWED");
}

export async function fingerprintMessageRequest(input: {
  conversationId: string;
  recipientId: string;
  text: string;
  replyToMessageId: string | null;
}): Promise<string> {
  const canonical = JSON.stringify([1, input.conversationId, input.recipientId, input.text, input.replyToMessageId]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

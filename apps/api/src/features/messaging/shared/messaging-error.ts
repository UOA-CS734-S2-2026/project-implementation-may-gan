export const messagingErrorCodes = [
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "BLOCKED",
  "PENDING",
  "DECLINED",
  "EDIT_WINDOW_EXPIRED",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_KEY_REUSED",
  "REPLY_NOT_FOUND",
  "REACTION_NOT_ALLOWED",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
] as const;

export type MessagingErrorCode = (typeof messagingErrorCodes)[number];

const messages: Record<MessagingErrorCode, string> = {
  NOT_FOUND: "The requested conversation or message was not found.",
  FORBIDDEN: "This messaging action is not permitted.",
  CONFLICT: "This messaging action conflicts with the current state.",
  BLOCKED: "This messaging action is not permitted.",
  PENDING: "This action is unavailable until the message request is accepted.",
  DECLINED: "This messaging action is not permitted.",
  EDIT_WINDOW_EXPIRED: "Messages can only be edited for 15 minutes.",
  VERSION_CONFLICT: "This message changed before your edit was saved.",
  IDEMPOTENCY_KEY_REUSED: "This client message ID was already used for different content.",
  REPLY_NOT_FOUND: "The reply target was not found in this conversation.",
  REACTION_NOT_ALLOWED: "This reaction is not allowed.",
  VALIDATION_FAILED: "The request contains invalid values.",
  RATE_LIMITED: "Too many new messages were sent. Try again later.",
};

/** A transport-neutral policy error. Routes must map this without disclosing block direction. */
export class MessagingError extends Error {
  constructor(
    readonly code: MessagingErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(messages[code]);
    this.name = "MessagingError";
  }
}

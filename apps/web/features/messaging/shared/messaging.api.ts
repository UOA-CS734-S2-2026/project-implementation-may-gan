import { Configuration, MessagingApi, ResponseError } from "@dayli/api-client";
import { apiBaseUrl } from "@/lib/api/config";

export type Reaction = "like" | "love" | "laugh" | "surprised" | "sad" | "thanks";

export interface MessagingReplyPreview {
  id: string;
  senderId: string;
  text: string | null;
  unsentAt: string | null;
}

export interface MessagingMessage {
  id: string;
  conversationId: string;
  sequence: string;
  senderId: string;
  clientMessageId: string;
  text: string | null;
  replyToMessageId: string | null;
  replyPreview: MessagingReplyPreview | null;
  version: number;
  createdAt: string;
  editedAt: string | null;
  unsentAt: string | null;
  reactions: Array<{ reaction: Reaction; count: number; reactedByActor: boolean }>;
}

export interface MessagingConversation {
  id: string;
  peer: { id: string; name?: string | null };
  requestState: "pending" | "active" | "declined";
  latestMessage: MessagingMessage | null;
  unreadCount: number;
  lastMessageSequence: string;
  lastChangeSequence: string;
  lastReadSequence: string;
  receiptSequence: string;
  capabilities: { canSend: boolean; canResolveRequest: boolean };
  updatedAt: string;
}

export interface MessagingPage<T> { items: T[]; nextCursor: string | null; hasMore: boolean; }
export interface RealtimeTicket { ticket: string; webSocketUrl: string; expiresAt: string; }
export interface MessagingChange { changeSequence: string; kind: string; messageId: string | null; memberId: string | null; }
export interface MessagingChangePage extends MessagingPage<MessagingChange> { highWatermark: string; nextChangeSequence: string | null; }
export interface MessagingUnread { inboxCount: number; requestCount: number; }
export type MessagingFailure = "unauthenticated" | "network" | "unavailable" | "invalid" | "conflict";
export type MessagingResult<T> = { ok: true; value: T } | { ok: false; failure: MessagingFailure; message: string };

function api(): MessagingApi | null {
  return apiBaseUrl ? new MessagingApi(new Configuration({ basePath: apiBaseUrl, credentials: "include" })) : null;
}

async function generated<T>(run: (client: MessagingApi) => Promise<T>): Promise<MessagingResult<T>> {
  const client = api();
  if (!client) return { ok: false, failure: "unavailable", message: "Messaging is not configured." };
  try {
    return { ok: true, value: await run(client) };
  } catch (error) {
    if (error instanceof ResponseError) {
      const failure: MessagingFailure = error.response.status === 401 ? "unauthenticated" : error.response.status === 409 ? "conflict" : error.response.status === 422 ? "invalid" : "unavailable";
      const body = await error.response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
      return { ok: false, failure, message: body?.error?.message ?? "Messages could not be updated." };
    }
    return { ok: false, failure: "network", message: "Updates are paused. Check your connection and try again." };
  }
}

/** The generated OpenAPI client owns the transport. These projections only normalize nullable API fields for UI. */
export const messagingApi = {
  inbox: (folder: "inbox" | "requests", cursor?: string) => generated((client) => client.listConversations({ folder, cursor }).then((value) => ({ items: value.items as unknown as MessagingConversation[], nextCursor: value.nextCursor ?? null, hasMore: Boolean(value.nextCursor) }))),
  unread: () => generated((client) => client.getMessagingUnread().then((value) => value as unknown as MessagingUnread)),
  direct: (recipientId: string, clientMessageId: string, text: string) => generated((client) => client.createDirectConversation({ createDirectConversationRequest: { recipientId, clientMessageId, text } }).then((value) => ({ conversation: value.conversation as unknown as MessagingConversation, message: value.message as unknown as MessagingMessage }))),
  findDirect: (recipientId: string) => generated((client) => client.findDirectConversation({ recipientId }).then((value) => value as { conversationId: string })),
  conversation: (conversationId: string) => generated((client) => client.getConversation({ conversationId }).then((value) => value as unknown as MessagingConversation)),
  resolveRequest: (conversationId: string, decision: "accept" | "decline") => generated((client) => client.resolveMessageRequest({ conversationId, resolveMessageRequestRequest: { decision } }).then((value) => value as unknown as MessagingConversation)),
  realtimeTicket: () => generated((client) => client.createRealtimeTicket({ requestBody: {} }).then((value) => value as unknown as RealtimeTicket)),
  changes: (conversationId: string, afterChangeSequence: string) => generated((client) => client.listConversationChanges({ conversationId, afterChangeSequence }).then((value) => ({ ...value, items: value.items as unknown as MessagingChange[], nextCursor: value.nextChangeSequence ?? null } as MessagingChangePage))),
  messages: (conversationId: string, beforeSequence?: string) => generated((client) => client.listMessages({ conversationId, beforeSequence }).then((value) => ({ items: value.items as unknown as MessagingMessage[], nextCursor: value.nextCursor ?? null, hasMore: value.hasMore }))),
  message: (conversationId: string, messageId: string) => generated((client) => client.getMessage({ conversationId, messageId }).then((value) => value as unknown as MessagingMessage)),
  send: (conversationId: string, clientMessageId: string, text: string, replyToMessageId?: string) => generated((client) => client.sendMessage({ conversationId, sendMessageRequest: { clientMessageId, text, ...(replyToMessageId ? { replyToMessageId } : {}) } }).then((value) => value as unknown as MessagingMessage)),
  edit: (conversationId: string, messageId: string, text: string, expectedVersion: number) => generated((client) => client.editMessage({ conversationId, messageId, editMessageRequest: { text, expectedVersion } }).then((value) => value as unknown as MessagingMessage)),
  unsend: (conversationId: string, messageId: string) => generated((client) => client.unsendMessage({ conversationId, messageId }).then((value) => value as unknown as MessagingMessage)),
  react: (conversationId: string, messageId: string, reaction: Reaction) => generated((client) => client.setMessageReaction({ conversationId, messageId, setMessageReactionRequest: { reaction } }).then((value) => value as unknown as MessagingMessage)),
  removeReaction: (conversationId: string, messageId: string) => generated((client) => client.removeMessageReaction({ conversationId, messageId }).then((value) => value as unknown as MessagingMessage)),
  markRead: (conversationId: string, throughSequence: string) => generated((client) => client.markConversationRead({ conversationId, markConversationReadRequest: { throughSequence } })),
};

import { Configuration, MessagingApi, ResponseError } from "@dayli/api-client";
import { apiBaseUrl } from "./config";

export interface MessagingMessage { id: string; conversationId: string; sequence: string; senderId: string; clientMessageId: string; text: string | null; version: number; createdAt: string; editedAt: string | null; unsentAt: string | null; replyToMessageId: string | null; reactions: Array<{ reaction: string; count: number; reactedByActor: boolean }>; }
export interface MessagingConversation { id: string; peer: { id: string; name?: string | null }; requestState: "pending" | "active" | "declined"; latestMessage: MessagingMessage | null; unreadCount: number; }
export interface RealtimeTicket { ticket: string; webSocketUrl: string; expiresAt: string; }
export interface MessagingChangePage { highWatermark: string; nextChangeSequence: string | null; hasMore: boolean; }
export type MessagingFailure = "unauthenticated" | "network" | "unavailable" | "invalid" | "conflict";
export type MessagingResult<T> = { ok: true; value: T } | { ok: false; failure: MessagingFailure; message: string };

function api(): MessagingApi | null { return apiBaseUrl ? new MessagingApi(new Configuration({ basePath: apiBaseUrl, credentials: "include" })) : null; }
async function raw<T>(path: string, init: RequestInit, decode: (value: unknown) => T): Promise<MessagingResult<T>> {
  if (!apiBaseUrl) return { ok: false, failure: "unavailable", message: "Messaging is not configured." };
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...init.headers } });
    if (!response.ok) return { ok: false, failure: response.status === 401 ? "unauthenticated" : "unavailable", message: "Updates are paused. Check your connection and try again." };
    return { ok: true, value: decode(await response.json()) };
  } catch { return { ok: false, failure: "network", message: "Updates are paused. Check your connection and try again." }; }
}
async function generated<T>(run: (client: MessagingApi) => Promise<T>): Promise<MessagingResult<T>> { const client = api(); if (!client) return { ok: false, failure: "unavailable", message: "Messaging is not configured." }; try { return { ok: true, value: await run(client) }; } catch (error) { if (error instanceof ResponseError) { const failure: MessagingFailure = error.response.status === 401 ? "unauthenticated" : error.response.status === 409 ? "conflict" : error.response.status === 422 ? "invalid" : "unavailable"; const body = await error.response.json().catch(() => undefined) as { error?: { message?: string } } | undefined; return { ok: false, failure, message: body?.error?.message ?? "Messages could not be updated." }; } return { ok: false, failure: "network", message: "Updates are paused. Check your connection and try again." }; } }

/** Generated OpenAPI client boundary. UI keeps these small stable display projections. */
export const messagingApi = {
  inbox: () => generated((client) => client.listConversations({ folder: "inbox" }).then((value) => ({ items: value.items as unknown as MessagingConversation[] }))),
  realtimeTicket: () => raw("/api/v1/realtime/tickets", { method: "POST", body: "{}" }, (value) => value as RealtimeTicket),
  changes: (conversationId: string, afterChangeSequence: string) => raw(`/api/v1/conversations/${encodeURIComponent(conversationId)}/changes?afterChangeSequence=${encodeURIComponent(afterChangeSequence)}`, { method: "GET" }, (value) => value as MessagingChangePage),
  messages: (conversationId: string) => generated((client) => client.listMessages({ conversationId }).then((value) => ({ items: value.items as unknown as MessagingMessage[] }))),
  send: (conversationId: string, clientMessageId: string, text: string) => generated((client) => client.sendMessage({ conversationId, sendMessageRequest: { clientMessageId, text } }).then((value) => value as unknown as MessagingMessage)),
};

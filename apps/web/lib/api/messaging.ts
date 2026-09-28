import { apiBaseUrl } from "./config";

export interface MessagingMessage {
  id: string; conversationId: string; sequence: string; senderId: string; clientMessageId: string;
  text: string | null; version: number; createdAt: string; editedAt: string | null; unsentAt: string | null;
  replyToMessageId: string | null;
  reactions: Array<{ reaction: string; count: number; reactedByActor: boolean }>;
}

export interface MessagingConversation {
  id: string; peer: { id: string; name?: string | null }; requestState: "pending" | "active" | "declined";
  latestMessage: MessagingMessage | null; unreadCount: number;
}

export type MessagingFailure = "unauthenticated" | "network" | "unavailable" | "invalid" | "conflict";
export type MessagingResult<T> = { ok: true; value: T } | { ok: false; failure: MessagingFailure; message: string };

async function request<T>(path: string, init?: RequestInit): Promise<MessagingResult<T>> {
  if (!apiBaseUrl) return { ok: false, failure: "unavailable", message: "Messaging is not configured." };
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1${path}`, { credentials: "include", cache: "no-store", ...init });
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
      const failure: MessagingFailure = response.status === 401 ? "unauthenticated"
        : response.status === 409 ? "conflict" : response.status === 422 ? "invalid" : "unavailable";
      return { ok: false, failure, message: body?.error?.message ?? "Messages could not be updated." };
    }
    return { ok: true, value: await response.json() as T };
  } catch {
    return { ok: false, failure: "network", message: "Updates are paused. Check your connection and try again." };
  }
}

export const messagingApi = {
  inbox: () => request<{ items: MessagingConversation[] }>("/conversations?folder=inbox"),
  messages: (conversationId: string) => request<{ items: MessagingMessage[] }>(`/conversations/${encodeURIComponent(conversationId)}/messages`),
  send: (conversationId: string, clientMessageId: string, text: string) => request<MessagingMessage>(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientMessageId, text }),
  }),
};

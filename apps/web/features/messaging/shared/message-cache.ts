import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { MessagingMessage, MessagingPage } from "./messaging.api";
import { messagingKeys } from "./messaging.keys";
import { mergeMessages, reconcileReplyPreviews } from "@/lib/messaging/reconcile";

export type LocalMessagingMessage = MessagingMessage & {
  delivery?: "pending" | "failed";
  retryIntent?: { clientMessageId: string; text: string; replyToMessageId?: string };
};
export type MessagePages = InfiniteData<MessagingPage<LocalMessagingMessage>, unknown>;

export function flattenMessagePages(data: MessagePages | undefined): LocalMessagingMessage[] {
  return data ? reconcileReplyPreviews(mergeMessages([], data.pages.flatMap((page) => page.items))) : [];
}

/** Keep every loaded page and its cursor while merging canonical projections and reply previews. */
export function mergeMessageIntoPages(data: MessagePages | undefined, incoming: readonly LocalMessagingMessage[]): MessagePages | undefined {
  if (!data) return data;
  const existing = data.pages.flatMap((page) => page.items);
  const merged = reconcileReplyPreviews(mergeMessages(existing, incoming));
  const byId = new Map(merged.map((message) => [message.id, message]));
  const present = new Set(existing.map((message) => message.id));
  const additions = incoming.filter((message) => !present.has(message.id));
  return { ...data, pages: data.pages.map((page, index) => ({ ...page, items: [...(index === 0 ? additions : []), ...page.items.map((message) => byId.get(message.id) ?? message)] })) };
}

export function updateMessagePages(queryClient: QueryClient, userId: string, conversationId: string, update: (data: MessagePages) => MessagePages | undefined) {
  queryClient.setQueryData<MessagePages>(messagingKeys.messages(userId, conversationId), (data) => data ? update(data) : data);
}

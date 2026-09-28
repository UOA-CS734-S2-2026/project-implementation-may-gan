import { useMutation, useQueryClient } from "@tanstack/react-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { mergeMessageIntoPages, type LocalMessagingMessage, type MessagePages, updateMessagePages } from "@/features/messaging/shared/message-cache";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";

export interface SendMessageIntent { clientMessageId: string; text: string; replyToMessageId?: string; }
function pendingMessage(userId: string, conversationId: string, intent: SendMessageIntent): LocalMessagingMessage {
  return { id: `pending:${intent.clientMessageId}`, conversationId, sequence: "999999999999999999", senderId: userId, clientMessageId: intent.clientMessageId, text: intent.text, replyToMessageId: intent.replyToMessageId ?? null, replyPreview: null, version: 0, createdAt: new Date().toISOString(), editedAt: null, unsentAt: null, reactions: [], delivery: "pending", retryIntent: intent };
}
/** Failed rows remain in the cache with their original ID, even after an ambiguous transport failure. */
export function useSendMessageMutation(conversationId: string) {
  const queryClient = useQueryClient(); const { user } = useSession(); const userId = user?.id ?? "anonymous";
  return useMutation({
    mutationKey: [...messagingKeys.messages(userId, conversationId), "send"], retry: false,
    mutationFn: async (intent: SendMessageIntent) => unwrapMessagingResult(await messagingApi.send(conversationId, intent.clientMessageId, intent.text, intent.replyToMessageId)),
    onMutate: async (intent) => { await queryClient.cancelQueries({ queryKey: messagingKeys.messages(userId, conversationId) }); updateMessagePages(queryClient, userId, conversationId, (data) => mergeMessageIntoPages(data, [pendingMessage(userId, conversationId, intent)]) ?? data); },
    onSuccess: (message, intent) => { updateMessagePages(queryClient, userId, conversationId, (data) => { const withoutPending: MessagePages = { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((entry) => entry.clientMessageId !== intent.clientMessageId) })) }; return mergeMessageIntoPages(withoutPending, [message]); }); void queryClient.invalidateQueries({ queryKey: messagingKeys.unread(userId) }); void queryClient.invalidateQueries({ queryKey: messagingKeys.inbox(userId, "inbox") }); },
    onError: (_error, intent) => updateMessagePages(queryClient, userId, conversationId, (data) => ({ ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((message) => message.clientMessageId === intent.clientMessageId ? { ...message, delivery: "failed", retryIntent: intent } : message) })) })),
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { mergeMessageIntoPages, updateMessagePages } from "@/features/messaging/shared/message-cache";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";
export function useUnsendMessageMutation(conversationId: string) { const queryClient = useQueryClient(); const { user } = useSession(); const userId = user?.id ?? "anonymous"; return useMutation({ mutationKey: [...messagingKeys.messages(userId, conversationId), "unsend"], retry: false, mutationFn: async ({ messageId }: { messageId: string }) => unwrapMessagingResult(await messagingApi.unsend(conversationId, messageId)), onSuccess: (message) => updateMessagePages(queryClient, userId, conversationId, (data) => mergeMessageIntoPages(data, [message]) ?? data) }); }

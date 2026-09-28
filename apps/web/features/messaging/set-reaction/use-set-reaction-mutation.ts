import { useMutation, useQueryClient } from "@tanstack/react-query";
import { messagingApi, type Reaction } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { mergeMessageIntoPages, updateMessagePages } from "@/features/messaging/shared/message-cache";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";
export function useSetReactionMutation(conversationId: string) { const queryClient = useQueryClient(); const { user } = useSession(); const userId = user?.id ?? "anonymous"; return useMutation({ mutationKey: [...messagingKeys.messages(userId, conversationId), "set-reaction"], retry: false, mutationFn: async ({ messageId, reaction }: { messageId: string; reaction: Reaction }) => unwrapMessagingResult(await messagingApi.react(conversationId, messageId, reaction)), onSuccess: (message) => updateMessagePages(queryClient, userId, conversationId, (data) => mergeMessageIntoPages(data, [message]) ?? data) }); }

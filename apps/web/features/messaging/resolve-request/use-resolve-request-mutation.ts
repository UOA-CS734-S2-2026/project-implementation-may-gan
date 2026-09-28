import { useMutation, useQueryClient } from "@tanstack/react-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";
export function useResolveRequestMutation(conversationId: string) { const queryClient = useQueryClient(); const { user } = useSession(); const userId = user?.id ?? "anonymous"; return useMutation({ mutationKey: [...messagingKeys.conversation(userId, conversationId), "resolve-request"], retry: false, mutationFn: async (decision: "accept" | "decline") => unwrapMessagingResult(await messagingApi.resolveRequest(conversationId, decision)), onSuccess: (conversation) => { queryClient.setQueryData(messagingKeys.conversation(userId, conversationId), conversation); void queryClient.invalidateQueries({ queryKey: messagingKeys.unread(userId) }); void queryClient.invalidateQueries({ queryKey: messagingKeys.inbox(userId, "requests") }); } }); }

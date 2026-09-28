import { useMutation, useQueryClient } from "@tanstack/react-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";
export function useCreateConversationMutation() { const queryClient = useQueryClient(); const { user } = useSession(); const userId = user?.id ?? "anonymous"; return useMutation({ mutationKey: [...messagingKeys.root(userId), "create-conversation"], retry: false, mutationFn: async ({ recipientId, clientMessageId, text }: { recipientId: string; clientMessageId: string; text: string }) => unwrapMessagingResult(await messagingApi.direct(recipientId, clientMessageId, text)), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: messagingKeys.unread(userId) }); void queryClient.invalidateQueries({ queryKey: messagingKeys.inbox(userId, "inbox") }); } }); }

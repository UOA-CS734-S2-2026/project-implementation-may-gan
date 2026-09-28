import { useQuery } from "@tanstack/react-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";

export function useConversationQuery(conversationId: string) {
  const { user } = useSession(); const userId = user?.id ?? "anonymous";
  return useQuery({ queryKey: messagingKeys.conversation(userId, conversationId), enabled: Boolean(user?.id && conversationId), queryFn: async () => unwrapMessagingResult(await messagingApi.conversation(conversationId)), retry: false });
}

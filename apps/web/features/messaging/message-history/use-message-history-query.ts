import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";

export function useMessageHistoryQuery(conversationId: string) {
  const { user } = useSession(); const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: messagingKeys.messages(userId, conversationId), enabled: Boolean(user?.id && conversationId), initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrapMessagingResult(await (pageParam === undefined ? messagingApi.messages(conversationId) : messagingApi.messages(conversationId, pageParam))),
    getNextPageParam: (page) => page.nextCursor ?? undefined, retry: false,
  });
}

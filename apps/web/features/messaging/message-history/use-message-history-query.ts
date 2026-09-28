import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { type MessagePages } from "@/features/messaging/shared/message-cache";
import { mergeMessages } from "@/lib/messaging/reconcile";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";

export function useMessageHistoryQuery(conversationId: string) {
  const { user } = useSession(); const userId = user?.id ?? "anonymous"; const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: messagingKeys.messages(userId, conversationId), enabled: Boolean(user?.id && conversationId), initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const result = unwrapMessagingResult(await (pageParam === undefined ? messagingApi.messages(conversationId) : messagingApi.messages(conversationId, pageParam)));
      const cached = queryClient.getQueryData<MessagePages>(messagingKeys.messages(userId, conversationId));
      const cachedPage = cached?.pages.find((_page, index) => cached.pageParams[index] === pageParam);
      // An initial request can finish after a local send. Keep its local/canonical rows while adopting the server cursor.
      return { ...result, items: mergeMessages(result.items, cachedPage?.items ?? []) };
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined, retry: false,
  });
}

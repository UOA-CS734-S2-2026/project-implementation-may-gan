import { useInfiniteQuery } from "@tanstack/react-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useSession } from "@/lib/session/hooks";

export function useInboxQuery(folder: "inbox" | "requests") {
  const { user } = useSession(); const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: messagingKeys.inbox(userId, folder), enabled: Boolean(user?.id), initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrapMessagingResult(await (pageParam === undefined ? messagingApi.inbox(folder) : messagingApi.inbox(folder, pageParam))),
    getNextPageParam: (page) => page.nextCursor ?? undefined, retry: false,
  });
}

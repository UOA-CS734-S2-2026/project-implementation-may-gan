import { useInfiniteQuery } from "@tanstack/react-query";
import { feedApi } from "@/features/feed/shared/feed.api";
import { unwrapFeedResult } from "@/features/feed/shared/query-result";
import { feedKeys } from "@/features/feed/shared/feed.keys";
import { useSession } from "@/lib/session/hooks";

/** Pages of released friends posts, keyed by account so a switch never shows another user's feed. */
export function useFeedQuery() {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: feedKeys.list(userId),
    enabled: Boolean(user?.id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrapFeedResult(await feedApi.page(pageParam)),
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor ?? undefined : undefined),
    retry: false,
  });
}

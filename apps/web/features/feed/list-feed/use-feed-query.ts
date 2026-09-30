import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { feedApi } from "@/features/feed/shared/feed.api";
import { FeedApiError, unwrapFeedResult } from "@/features/feed/shared/query-result";
import { feedKeys } from "@/features/feed/shared/feed.keys";
import { useSession } from "@/lib/session/hooks";

/**
 * Pages of yesterday's friends posts, keyed by account so a switch never shows
 * another user's feed. Focusing the window refetches from the first page, so
 * a feed left open overnight moves on to the new day.
 */
export function useFeedQuery() {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: feedKeys.list(userId),
    enabled: Boolean(user?.id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrapFeedResult(await feedApi.page(pageParam)),
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor ?? undefined : undefined),
    retry: false,
  });

  // A page loaded before midnight belongs to the previous feed day, so the
  // next page is refused; start again from the new day's first page.
  const dayChanged = query.error instanceof FeedApiError && query.error.failure === "dayChanged";
  useEffect(() => {
    if (dayChanged) void client.resetQueries({ queryKey: feedKeys.list(userId) });
  }, [dayChanged, client, userId]);

  return query;
}

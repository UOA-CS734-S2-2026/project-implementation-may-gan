import { useInfiniteQuery } from "@tanstack/react-query";
import { postsApi } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { unwrapPostResult } from "@/features/posts/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** Pages of one profile's posts, keyed by account so a switch never shows another user's view. */
export function useProfilePostsQuery(username: string) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: postKeys.profile(userId, username),
    enabled: Boolean(user?.id && username),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrapPostResult(await postsApi.profilePage(username, pageParam)),
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor ?? undefined : undefined),
    retry: false,
  });
}

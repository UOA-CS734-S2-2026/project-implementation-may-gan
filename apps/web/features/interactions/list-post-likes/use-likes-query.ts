import { useInfiniteQuery } from "@tanstack/react-query";
import { interactionKeys, interactionsApi, unwrapInteraction, type PostLikesPage } from "@/features/interactions/shared/interactions.api";
import { useSession } from "@/lib/session/hooks";

/** A page the server refused because the viewer's access to the post is gone. */
export type LikesPage = PostLikesPage & { unavailable?: true };

/**
 * Who liked a post, newest first, loaded only once the list is opened. A 404
 * returns an empty "unavailable" page instead of throwing, so a refetch
 * replaces the pages already loaded and the old identities don't stay in the cache.
 */
export function useLikesQuery(postId: string, enabled: boolean) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: interactionKeys.likes(userId, postId),
    enabled: enabled && Boolean(user?.id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<LikesPage> => {
      const result = await interactionsApi.likes(postId, pageParam);
      if (!result.ok && result.failure === "notFound") return { items: [], nextCursor: null, hasMore: false, unavailable: true };
      return unwrapInteraction(result);
    },
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor ?? undefined : undefined),
    retry: false,
  });
}

import { useInfiniteQuery } from "@tanstack/react-query";
import { interactionKeys, interactionsApi, unwrapInteraction } from "@/features/interactions/shared/interactions.api";
import { useSession } from "@/lib/session/hooks";

/** Who liked a post, newest first, loaded only once the list is opened. */
export function useLikesQuery(postId: string, enabled: boolean) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  return useInfiniteQuery({
    queryKey: interactionKeys.likes(userId, postId),
    enabled: enabled && Boolean(user?.id),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => unwrapInteraction(await interactionsApi.likes(postId, pageParam)),
    getNextPageParam: (page) => (page.hasMore ? page.nextCursor ?? undefined : undefined),
    retry: false,
  });
}

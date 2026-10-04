import { useQuery } from "@tanstack/react-query";
import { profilesApi, type MoodRange } from "@/features/profiles/shared/profiles.api";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { unwrapProfileResult } from "@/features/profiles/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** One profile's mood history, keyed by account so a switch never shows another user's view. */
export function useMoodHistoryQuery(username: string, range: MoodRange) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  const queryKey = profileKeys.mood(userId, username, range);
  return useQuery({
    queryKey,
    enabled: Boolean(user?.id && username),
    queryFn: async () => unwrapProfileResult(await profilesApi.moodHistory(username, range)),
    // Keep the last range on screen while the next one loads, but only for the
    // same account and profile: another person's history must never stand in.
    placeholderData: (previous, previousQuery) =>
      previousQuery && previousQuery.queryKey[1] === queryKey[1] && previousQuery.queryKey[3] === queryKey[3]
        ? previous
        : undefined,
    retry: false,
  });
}

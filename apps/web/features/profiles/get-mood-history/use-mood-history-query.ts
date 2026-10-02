import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { profilesApi, type MoodRange } from "@/features/profiles/shared/profiles.api";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { unwrapProfileResult } from "@/features/profiles/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** One profile's mood history, keyed by account so a switch never shows another user's view. */
export function useMoodHistoryQuery(username: string, range: MoodRange) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: profileKeys.mood(userId, username, range),
    enabled: Boolean(user?.id && username),
    queryFn: async () => unwrapProfileResult(await profilesApi.moodHistory(username, range)),
    // Keep the last range on screen while the next one loads.
    placeholderData: keepPreviousData,
    retry: false,
  });
}

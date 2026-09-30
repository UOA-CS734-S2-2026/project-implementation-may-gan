import { useQuery } from "@tanstack/react-query";
import { profilesApi } from "@/features/profiles/shared/profiles.api";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { unwrapProfileResult } from "@/features/profiles/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** One profile's details, keyed by account so a switch never shows another user's view. */
export function useProfileDetailsQuery(username: string | undefined) {
  const { user } = useSession();
  const userId = user?.id ?? "anonymous";
  return useQuery({
    queryKey: profileKeys.details(userId, username ?? ""),
    enabled: Boolean(user?.id && username),
    queryFn: async () => unwrapProfileResult(await profilesApi.details(username!)),
    retry: false,
  });
}

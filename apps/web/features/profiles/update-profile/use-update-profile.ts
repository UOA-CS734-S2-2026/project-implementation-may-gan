import { useMutation, useQueryClient } from "@tanstack/react-query";
import { profilesApi, type ProfileDetails, type ProfileUpdate } from "@/features/profiles/shared/profiles.api";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { unwrapProfileResult } from "@/features/profiles/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** Runs a change to your own profile and refreshes everywhere it is shown. */
export function useProfileMutation<T>(change: (input: T) => Promise<ProfileDetails>) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  return useMutation({
    mutationFn: change,
    onSuccess: (profile) => {
      client.setQueryData(profileKeys.details(userId, profile.username), profile);
      void client.invalidateQueries({ queryKey: profileKeys.all(userId) });
      void client.invalidateQueries({ queryKey: ["social-profile", userId] });
      void client.invalidateQueries({ queryKey: ["username-profile", userId] });
      void client.invalidateQueries({ queryKey: ["posts", userId] });
    },
  });
}

/** Saves profile fields. */
export function useUpdateProfile() {
  return useProfileMutation(async (changes: ProfileUpdate) => unwrapProfileResult(await profilesApi.update(changes)));
}

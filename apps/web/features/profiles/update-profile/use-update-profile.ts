import { useMutation, useQueryClient } from "@tanstack/react-query";
import { profilesApi, type ProfileUpdate } from "@/features/profiles/shared/profiles.api";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { unwrapProfileResult } from "@/features/profiles/shared/query-result";
import { useSession } from "@/lib/session/hooks";

/** Saves profile fields and refreshes everywhere the name or bio is shown. */
export function useUpdateProfile() {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  return useMutation({
    mutationFn: async (changes: ProfileUpdate) => unwrapProfileResult(await profilesApi.update(changes)),
    onSuccess: (profile) => {
      client.setQueryData(profileKeys.details(userId, profile.username), profile);
      void client.invalidateQueries({ queryKey: profileKeys.all(userId) });
      void client.invalidateQueries({ queryKey: ["social-profile", userId] });
      void client.invalidateQueries({ queryKey: ["username-profile", userId] });
      void client.invalidateQueries({ queryKey: ["posts", userId] });
    },
  });
}

"use client";

import type { ProfileVisibility } from "@/features/profiles/shared/profiles.api";
import { ProfileApiError, profileSaveMessage } from "@/features/profiles/shared/query-result";
import { useUpdateProfile } from "@/features/profiles/update-profile/use-update-profile";

export function ProfileVisibilityToggle({ visibility }: { visibility: ProfileVisibility }) {
  const save = useUpdateProfile();
  // Show the requested state while it saves; a failure falls back to the saved one.
  const shown = save.isPending ? save.variables?.profileVisibility ?? visibility : visibility;
  const isPrivate = shown === "private";

  return (
    <div className="space-y-2 rounded-lg border border-foreground/10 p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Private profile</span>
          <span className="text-xs text-foreground/60">
            {isPrivate
              ? "Only your friends can see your bio and streak"
              : "Anyone signed in can see your bio and streak"}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPrivate}
          aria-label="Private profile"
          onClick={() => save.mutate({ profileVisibility: isPrivate ? "public" : "private" })}
          disabled={save.isPending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition duration-200 disabled:opacity-60 ${
            isPrivate ? "bg-foreground-accent" : "bg-foreground/20"
          } hover:opacity-75 hover:cursor-pointer`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              isPrivate ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      <p className="text-xs text-foreground/60">Your daylies are always shared with friends only.</p>
      {save.isError && save.error instanceof ProfileApiError && (
        <p role="alert" className="text-xs text-red-500">{profileSaveMessage(save.error.failure)}</p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { ProfileDetails } from "@/features/profiles/shared/profiles.api";
import { ProfileApiError, profileSaveMessage } from "@/features/profiles/shared/query-result";
import { useUpdateProfile } from "./use-update-profile";

const BIO_MAX = 160;
const NAME_MAX = 80;

/** The public name and bio. A blank name shows the username instead. */
export function EditProfileForm({ profile }: { profile: ProfileDetails }) {
  const [publicName, setPublicName] = useState(profile.displayName === profile.username ? "" : profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const save = useUpdateProfile();

  return (
    <form
      className="space-y-4 rounded-2xl bg-background p-5 shadow-card"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ publicName: publicName.trim(), bio: bio.trim() });
      }}
    >
      <h2 className="text-sm font-medium">Profile</h2>
      <label className="block space-y-1">
        <span className="text-xs text-foreground/60">Public name</span>
        <input
          value={publicName}
          onChange={(event) => setPublicName(event.target.value)}
          maxLength={NAME_MAX}
          placeholder={profile.username}
          className="w-full rounded-lg bg-background-secondary px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      <label className="block space-y-1">
        <span className="flex justify-between text-xs text-foreground/60">
          <span>Bio</span>
          <span aria-live="polite">{bio.length}/{BIO_MAX}</span>
        </span>
        <textarea
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={BIO_MAX}
          rows={3}
          className="w-full resize-none rounded-lg bg-background-secondary px-3 py-2 text-base outline-none focus:ring-2 focus:ring-accent"
        />
      </label>
      <div className="flex items-center justify-end gap-3">
        {save.isError && save.error instanceof ProfileApiError && (
          <p role="alert" className="text-xs text-red-500">{profileSaveMessage(save.error.failure)}</p>
        )}
        {save.isSuccess && <p role="status" className="text-xs text-foreground/60">Saved.</p>}
        <button
          type="submit"
          disabled={save.isPending}
          className="rounded-xl bg-foreground-accent px-4 py-2 font-serif text-sm text-white disabled:opacity-50"
        >
          {save.isPending ? "saving…" : "save profile"}
        </button>
      </div>
    </form>
  );
}

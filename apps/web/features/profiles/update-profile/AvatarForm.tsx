"use client";

import Image from "next/image";
import { useRef } from "react";
import { profilesApi, type ProfileDetails } from "@/features/profiles/shared/profiles.api";
import { ProfileApiError, profileSaveMessage, unwrapProfileResult } from "@/features/profiles/shared/query-result";
import { useProfileMutation } from "./use-update-profile";

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

/** A profile photo, or the first letter of the name when there is none. */
export function ProfileAvatar({ profile, size }: { profile: Pick<ProfileDetails, "avatarUrl" | "displayName">; size: number }) {
  if (profile.avatarUrl) {
    return (
      <Image
        src={profile.avatarUrl}
        alt={`${profile.displayName}'s profile photo`}
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-background-accent font-serif font-semibold text-foreground-accent"
      style={{ width: size, height: size, fontSize: size / 3 }}
    >
      {profile.displayName.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function AvatarForm({ profile }: { profile: ProfileDetails }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useProfileMutation(async (file: File) => {
    if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_BYTES) throw new ProfileApiError({ kind: "photoRejected" });
    return unwrapProfileResult(await profilesApi.uploadAvatar(file));
  });
  const remove = useProfileMutation(async (_: void) => unwrapProfileResult(await profilesApi.removeAvatar()));
  const busy = upload.isPending || remove.isPending;
  const error = upload.error ?? remove.error;

  return (
    <section className="space-y-3 rounded-lg border border-foreground/10 p-4">
      <h2 className="text-sm font-medium">Photo</h2>
      <div className="flex items-center gap-4">
        <ProfileAvatar profile={profile} size={64} />
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={PHOTO_TYPES.join(",")}
            aria-label="Choose a profile photo"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload.mutate(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="rounded-xl bg-foreground-accent px-4 py-2 font-serif text-sm text-white disabled:opacity-50"
          >
            {upload.isPending ? "uploading…" : profile.avatarUrl ? "change photo" : "add photo"}
          </button>
          {profile.avatarUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.mutate()}
              className="rounded-xl border border-foreground/20 px-4 py-2 font-serif text-sm disabled:opacity-50"
            >
              remove
            </button>
          )}
        </div>
      </div>
      {error instanceof ProfileApiError && (
        <p role="alert" className="text-xs text-red-500">{profileSaveMessage(error.failure)}</p>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { profilesApi, type ProfileDetails } from "@/features/profiles/shared/profiles.api";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { ProfileApiError, profileSaveMessage, unwrapProfileResult } from "@/features/profiles/shared/query-result";
import { useSession } from "@/lib/session/hooks";

const HANDLE = /^[a-z0-9][a-z0-9_]{2,29}$/;

function longDate(when: Date | string) {
  return new Intl.DateTimeFormat("en-NZ", { dateStyle: "long", timeZone: "Pacific/Auckland" }).format(new Date(when));
}

/** Changes the handle at most once every 30 days; the old one stays reserved for its owner. */
export function ChangeUsernameForm({ profile }: { profile: ProfileDetails }) {
  const { user } = useSession();
  const client = useQueryClient();
  const userId = user?.id ?? "anonymous";
  const [username, setUsername] = useState(profile.username);
  const next = username.trim().toLowerCase();
  const waitUntil = profile.owner?.usernameChangeAvailableAt ?? null;
  const change = useMutation({
    mutationFn: async () => unwrapProfileResult(await profilesApi.changeUsername(next)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: profileKeys.all(userId) });
      void client.invalidateQueries({ queryKey: ["username-profile", userId] });
      void client.invalidateQueries({ queryKey: ["social-profile", userId] });
      void client.invalidateQueries({ queryKey: ["posts", userId] });
    },
  });
  const unchanged = next === profile.username.toLowerCase();
  const valid = HANDLE.test(next);

  return (
    <form
      className="space-y-3 rounded-lg border border-foreground/10 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !unchanged) change.mutate();
      }}
    >
      <h2 className="text-sm font-medium">Username</h2>
      <label className="block space-y-1">
        <span className="flex items-center rounded-lg bg-background-secondary px-3 focus-within:ring-2 focus-within:ring-accent">
          <span aria-hidden className="text-foreground/50">@</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            disabled={Boolean(waitUntil) || change.isPending}
            maxLength={30}
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Username"
            aria-invalid={!valid}
            className="w-full bg-transparent py-2 pl-1 text-base outline-none disabled:opacity-60"
          />
        </span>
      </label>
      <p className="text-xs text-foreground/60">
        {waitUntil
          ? `You can change your username again on ${longDate(waitUntil)}.`
          : "You can change it once every 30 days. Your old username stays reserved for you for 30 days, and links to it will lead here."}
      </p>
      {!valid && <p className="text-xs text-red-500">Use 3-30 lowercase letters, numbers, or underscores.</p>}
      <div className="flex items-center justify-end gap-3">
        {change.isError && change.error instanceof ProfileApiError && (
          <p role="alert" className="text-xs text-red-500">{profileSaveMessage(change.error.failure)}</p>
        )}
        {change.isSuccess && <p role="status" className="text-xs text-foreground/60">Username changed.</p>}
        <button
          type="submit"
          disabled={Boolean(waitUntil) || !valid || unchanged || change.isPending}
          className="rounded-xl bg-foreground-accent px-4 py-2 font-serif text-sm text-white disabled:opacity-50"
        >
          {change.isPending ? "changing…" : "change username"}
        </button>
      </div>
    </form>
  );
}

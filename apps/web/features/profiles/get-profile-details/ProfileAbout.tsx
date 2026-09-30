import type { ProfileDetails } from "@/features/profiles/shared/profiles.api";

/** MBTI, what they do, and what they're listening to, as in the original web app. */
export function ProfileAbout({ profile }: { profile: Pick<ProfileDetails, "mbti" | "whatIDo" | "listeningTo"> }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-rose-50 px-4 py-3">
          <p className="text-xs font-medium text-rose-400">mbti</p>
          <p className="mt-0.5 text-base font-semibold text-rose-500">{profile.mbti || "—"}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 px-4 py-3">
          <p className="text-xs font-medium text-sky-400">what i do</p>
          <p className="mt-0.5 text-base font-semibold text-sky-600 break-words">{profile.whatIDo || "—"}</p>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-emerald-500">what i&apos;m listening to</p>
          <div className="mt-1 flex items-center gap-2">
            <span aria-hidden className="text-base">🎵</span>
            <p className="truncate text-sm font-medium text-emerald-700">{profile.listeningTo || "—"}</p>
          </div>
        </div>
        <span aria-hidden className="text-2xl opacity-20">♪</span>
      </div>
    </>
  );
}

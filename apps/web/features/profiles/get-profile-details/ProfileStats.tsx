import Link from "next/link";
import type { ProfileDetails } from "@/features/profiles/shared/profiles.api";

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${accent ? "text-orange-500" : ""}`}>{value}</p>
      <p className="text-xs text-foreground-secondary">{label}</p>
    </div>
  );
}

/**
 * The counts under the bio, laid out as in the original web app. Confirmed
 * server values only; nothing here nudges anyone to post.
 */
export function ProfileStats({ profile, friendsHref }: { profile: Pick<ProfileDetails, "stats" | "streak">; friendsHref?: string }) {
  // Both are null together whenever the bio is hidden.
  const stats = profile.stats as ProfileDetails["stats"] | null;
  const streak = profile.streak as ProfileDetails["streak"] | null;
  if (!stats || !streak) return null;
  const friends = <Stat value={stats.friends} label={stats.friends === 1 ? "Friend" : "Friends"} />;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 rounded-2xl bg-gray-100/80 px-6 py-4">
      <Stat value={stats.posts} label={stats.posts === 1 ? "Post" : "Posts"} />
      {friendsHref ? <Link href={friendsHref} className="transition hover:opacity-70">{friends}</Link> : friends}
      <Stat value={streak.current} label="Day streak" accent />
    </div>
  );
}

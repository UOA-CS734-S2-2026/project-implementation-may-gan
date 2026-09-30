import type { ProfileDetails } from "@/features/profiles/shared/profiles.api";

const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

/**
 * Confirmed streak values from the server. A missed day just shows the
 * longest streak; nothing here nudges anyone to post.
 */
export function ProfileStreak({ streak, isMe }: { streak: ProfileDetails["streak"] | null; isMe: boolean }) {
  if (!streak) return null;
  if (streak.longest === 0) {
    return isMe ? <p className="font-sans text-sm text-foreground-tertiary">Your streak starts with your first dayli.</p> : null;
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-sans text-sm text-foreground-secondary">
      {streak.current > 0 && <p className="font-medium text-foreground">{days(streak.current)} in a row</p>}
      <p>Longest: {days(streak.longest)}</p>
      {isMe && streak.postedToday && <p>Today&apos;s dayli is in.</p>}
    </div>
  );
}

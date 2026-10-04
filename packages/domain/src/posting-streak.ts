import type { AucklandDate } from "./auckland-day.js";
import { dateFromDayNumber, dayNumber } from "./calendar-days.js";

export interface PostingStreak {
  /** Consecutive posted days ending today, or yesterday while today is still open. */
  readonly current: number;
  readonly longest: number;
  /** The most recent posted day, or null when there are none. */
  readonly lastPostDate: AucklandDate | null;
  /** True when today's post has been accepted. */
  readonly postedToday: boolean;
}

/**
 * Posting streaks from the Auckland days that have an accepted post.
 *
 * A missing day ends a streak, but today does not break the current streak
 * until its deadline passes: with no post yet, the current streak is the run
 * ending yesterday. Duplicate days, such as a retried submission, count once.
 */
export function calculatePostingStreak(postedDates: readonly string[], today: AucklandDate): PostingStreak {
  const todayNumber = dayNumber(today);
  const days = [...new Set(postedDates.map(dayNumber))]
    .filter((day) => day <= todayNumber)
    .sort((a, b) => a - b);
  if (days.length === 0) return { current: 0, longest: 0, lastPostDate: null, postedToday: false };

  let longest = 1;
  let run = 1;
  for (let index = 1; index < days.length; index += 1) {
    run = days[index] === days[index - 1]! + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const last = days.at(-1)!;
  const postedToday = last === todayNumber;
  // `run` is the streak ending on the last posted day; it is still current
  // only if that day is today or yesterday.
  const current = last >= todayNumber - 1 ? run : 0;
  const lastPostDate = dateFromDayNumber(last);
  return { current, longest, lastPostDate, postedToday };
}

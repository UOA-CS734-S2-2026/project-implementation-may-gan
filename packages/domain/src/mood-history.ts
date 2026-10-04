import type { AucklandDate } from "./auckland-day.js";
import { dateFromDayNumber, dayNumber } from "./calendar-days.js";

export const moodHistoryRanges = ["30d", "90d", "1y"] as const;
export type MoodHistoryRange = (typeof moodHistoryRanges)[number];

const rangeDays: Record<MoodHistoryRange, number> = { "30d": 30, "90d": 90, "1y": 365 };

/** The range ending today and the same-length range just before it, inclusive. */
export interface MoodHistoryWindow {
  readonly from: AucklandDate;
  readonly to: AucklandDate;
  readonly previousFrom: AucklandDate;
  readonly previousTo: AucklandDate;
}

export interface MoodRating {
  readonly localDate: string;
  readonly rating: number;
}

export interface MoodPeriodSummary {
  readonly from: AucklandDate;
  readonly to: AucklandDate;
  /** Days in the period since tracking began. Days before that are not missing data. */
  readonly trackedDays: number;
  readonly postedDays: number;
  /**
   * Tracked days that ended without any post. A post the caller can't see,
   * such as a solo one, is not missing. Today is never missing while it is
   * still open.
   */
  readonly missingDays: number;
  /** Mean rating to one decimal place, or null with no posts. */
  readonly average: number | null;
  readonly lowest: number | null;
  readonly highest: number | null;
}

export interface MoodHistory {
  readonly range: MoodHistoryRange;
  readonly trackedFrom: AucklandDate;
  /** Rated days the caller can see in the current period, oldest first. */
  readonly days: Array<{ localDate: AucklandDate; rating: number }>;
  /** Days in the current period with a post the caller can't see. They are not missing. */
  readonly hiddenDays: AucklandDate[];
  readonly current: MoodPeriodSummary;
  readonly previous: MoodPeriodSummary;
}

export function moodHistoryWindow(range: MoodHistoryRange, today: AucklandDate): MoodHistoryWindow {
  const to = dayNumber(today);
  const from = to - rangeDays[range] + 1;
  return {
    from: dateFromDayNumber(from),
    to: today,
    previousFrom: dateFromDayNumber(from - rangeDays[range]),
    previousTo: dateFromDayNumber(from - 1),
  };
}

function summarize(
  from: number,
  to: number,
  trackedFrom: number,
  today: number,
  ratings: ReadonlyMap<number, number>,
  hidden: ReadonlySet<number>,
): MoodPeriodSummary {
  const start = Math.max(from, trackedFrom);
  const trackedDays = Math.max(0, to - start + 1);
  const posted: number[] = [];
  let hiddenDays = 0;
  for (let day = start; day <= to; day += 1) {
    const rating = ratings.get(day);
    if (rating !== undefined) posted.push(rating);
    else if (hidden.has(day)) hiddenDays += 1;
  }
  const todayStillOpen = today >= start && today <= to && !ratings.has(today) && !hidden.has(today);
  const total = posted.reduce((sum, rating) => sum + rating, 0);
  return {
    from: dateFromDayNumber(from),
    to: dateFromDayNumber(to),
    trackedDays,
    postedDays: posted.length,
    missingDays: trackedDays - posted.length - hiddenDays - (todayStillOpen ? 1 : 0),
    average: posted.length > 0 ? Math.round((total / posted.length) * 10) / 10 : null,
    lowest: posted.length > 0 ? Math.min(...posted) : null,
    highest: posted.length > 0 ? Math.max(...posted) : null,
  };
}

/**
 * One person's ratings over a range, compared with the range before it.
 * [ratings] are the posts the caller can see; [hiddenDates] are the author's
 * other posted days, which count as posted but show no rating. Tracking starts
 * on the account's first day, so a new account is not shown months of missing
 * data. The numbers describe what was posted; they make no claim about why.
 */
export function summarizeMoodHistory(
  range: MoodHistoryRange,
  today: AucklandDate,
  trackedFrom: AucklandDate,
  ratings: readonly MoodRating[],
  hiddenDates: readonly string[] = [],
): MoodHistory {
  const window = moodHistoryWindow(range, today);
  const todayNumber = dayNumber(today);
  const tracked = Math.min(dayNumber(trackedFrom), todayNumber);
  const byDay = new Map<number, number>();
  for (const { localDate, rating } of ratings) {
    const day = dayNumber(localDate);
    if (day <= todayNumber) byDay.set(day, rating);
  }

  const hidden = new Set(hiddenDates.map(dayNumber).filter((day) => day <= todayNumber && !byDay.has(day)));
  const from = dayNumber(window.from);
  const days = [...byDay.entries()]
    .filter(([day]) => day >= from)
    .sort(([a], [b]) => a - b)
    .map(([day, rating]) => ({ localDate: dateFromDayNumber(day), rating }));

  return {
    range,
    trackedFrom: dateFromDayNumber(tracked),
    days,
    hiddenDays: [...hidden].filter((day) => day >= from).sort((a, b) => a - b).map(dateFromDayNumber),
    current: summarize(from, todayNumber, tracked, todayNumber, byDay, hidden),
    previous: summarize(dayNumber(window.previousFrom), dayNumber(window.previousTo), tracked, todayNumber, byDay, hidden),
  };
}

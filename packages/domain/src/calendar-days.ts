import type { AucklandDate } from "./auckland-day.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days since 1970-01-01. `YYYY-MM-DD` dates carry no zone, so UTC arithmetic is exact. */
export function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) / DAY_MS;
}

export function dateFromDayNumber(day: number): AucklandDate {
  return new Date(day * DAY_MS).toISOString().slice(0, 10) as AucklandDate;
}

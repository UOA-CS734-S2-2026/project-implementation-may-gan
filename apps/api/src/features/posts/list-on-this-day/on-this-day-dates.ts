import type { AucklandDate } from "@dayli/domain";

/**
 * The oldest year a memory can come from. Dayli did not exist earlier, so a
 * bounded range keeps the candidate list, and the query built from it, small.
 */
export const EARLIEST_MEMORY_YEAR = 2000;

export interface MemoryCandidate {
  localDate: AucklandDate;
  yearsAgo: number;
}

function isValidDate(year: number, month: number, day: number): boolean {
  // setUTCFullYear keeps years 0-99 literal; Date.UTC would map them to 19xx.
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/**
 * The same Auckland month and day in every earlier year, newest year first.
 *
 * A year is skipped when it has no such date, so a 29 February post is
 * remembered only on 29 February of a later leap year. The dates are
 * built one year at a time and validated, never by subtracting years or days
 * from today, so 29 February can never roll over to 28 February or 1 March.
 * The current year is not a candidate.
 */
export function onThisDayCandidates(today: AucklandDate): MemoryCandidate[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) throw new RangeError(`Invalid Auckland date: ${today}`);
  const [currentYear, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (!isValidDate(currentYear, month, day)) throw new RangeError(`Invalid Auckland date: ${today}`);

  const candidates: MemoryCandidate[] = [];
  for (let year = currentYear - 1; year >= EARLIEST_MEMORY_YEAR; year -= 1) {
    if (!isValidDate(year, month, day)) continue;
    candidates.push({
      localDate: `${String(year).padStart(4, "0")}-${match[2]}-${match[3]}` as AucklandDate,
      yearsAgo: currentYear - year,
    });
  }
  return candidates;
}

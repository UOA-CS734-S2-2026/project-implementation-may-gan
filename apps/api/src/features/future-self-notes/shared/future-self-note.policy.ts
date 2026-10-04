import { FUTURE_SELF_NOTE_LIMITS } from "./future-self-note.contract";

/** Add whole calendar days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = parts(date);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day + days);
  return format(value);
}

/**
 * Add whole years, moving 29 February to 28 February in a year without one, so
 * the result is always a real calendar date.
 */
export function addYears(date: string, years: number): string {
  const [year, month, day] = parts(date);
  const value = new Date(0);
  value.setUTCFullYear(year + years, month - 1, 1);
  const lastDay = new Date(0);
  lastDay.setUTCFullYear(value.getUTCFullYear(), month, 0);
  value.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  return format(value);
}

function parts(date: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new RangeError(`Invalid Auckland date: ${date}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function format(value: Date): string {
  return `${String(value.getUTCFullYear()).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

/** The earliest and latest delivery dates a create or reschedule may choose, given today's Auckland date. */
export function deliveryWindow(today: string): { earliest: string; latest: string } {
  return { earliest: addDays(today, 1), latest: addYears(today, FUTURE_SELF_NOTE_LIMITS.maxYearsAhead) };
}

export function isDeliverOnAllowed(deliverOn: string, today: string): boolean {
  const { earliest, latest } = deliveryWindow(today);
  return deliverOn >= earliest && deliverOn <= latest;
}

/**
 * A note's text may be read by its owner from its Auckland date onward, whether
 * or not the delivery job has run yet, and always once it is delivered. ISO
 * dates compare correctly as strings.
 */
export function isNoteReadable(note: { deliverOn: string; status: "scheduled" | "delivered" }, today: string): boolean {
  return note.status === "delivered" || note.deliverOn <= today;
}

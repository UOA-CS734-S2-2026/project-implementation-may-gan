const AUCKLAND_TIME_ZONE = "Pacific/Auckland";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: AUCKLAND_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: AUCKLAND_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type AucklandDate = `${number}-${number}-${number}`;

/** A source of authoritative server time. Client/device time is not used. */
export interface Clock {
  now(): Date;
}

export type ClockLike = Clock | (() => Date);

/**
 * The daily posting interval. It is half-open: the start is included and the
 * next midnight is excluded. The two boundaries are UTC instants, but are
 * derived from Auckland calendar midnights rather than elapsed-hour math.
 */
export interface PostingWindow {
  readonly startUtc: Date;
  readonly endUtcExclusive: Date;
}

export interface AucklandDay {
  readonly localDate: AucklandDate;
  readonly startUtc: Date;
  readonly nextMidnightUtc: Date;
  readonly postingWindow: PostingWindow;
}

export interface AucklandDayService {
  /** Resolve the day containing the injected server-clock instant. */
  current(): AucklandDay;
  /** Resolve the Auckland day containing an explicitly supplied instant. */
  forInstant(instant: Date): AucklandDay;
}

const systemClock: Clock = {
  now: () => new Date(),
};

function readClock(clock: ClockLike): Date {
  const now = typeof clock === "function" ? clock() : clock.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("The clock must return a valid Date.");
  }
  return new Date(now.getTime());
}

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new Error(`The time-zone formatter did not provide a ${type} part.`);
  }
  return Number(value);
}

function partsAt(instant: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = partsFormatter.formatToParts(instant);
  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
    hour: readPart(parts, "hour"),
    minute: readPart(parts, "minute"),
    second: readPart(parts, "second"),
  };
}

function localDateAt(instant: Date): AucklandDate {
  const parts = dateFormatter.formatToParts(instant);
  const year = readPart(parts, "year").toString().padStart(4, "0");
  const month = readPart(parts, "month").toString().padStart(2, "0");
  const day = readPart(parts, "day").toString().padStart(2, "0");
  return `${year}-${month}-${day}` as AucklandDate;
}

function utcWallTime(year: number, month: number, day: number): number {
  // Date.UTC treats years 0-99 specially. setUTCFullYear keeps this calendar
  // helper correct for all four-digit dates without relying on a duration.
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  value.setUTCHours(0, 0, 0, 0);
  return value.getTime();
}

function offsetAt(instant: Date): number {
  const parts = partsAt(instant);
  return (
    utcWallTime(parts.year, parts.month, parts.day) +
    parts.hour * 60 * 60 * 1000 +
    parts.minute * 60 * 1000 +
    parts.second * 1000 -
    instant.getTime()
  );
}

function parseAucklandDate(date: AucklandDate): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new RangeError(`Invalid Auckland date: ${date}`);
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  check.setUTCHours(0, 0, 0, 0);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid Auckland date: ${date}`);
  }
  return [year, month, day];
}

function nextAucklandDate(date: AucklandDate): AucklandDate {
  const [year, month, day] = parseAucklandDate(date);
  const next = new Date(0);
  next.setUTCFullYear(year, month - 1, day + 1);
  next.setUTCHours(0, 0, 0, 0);
  return `${next.getUTCFullYear().toString().padStart(4, "0")}-${(next.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${next.getUTCDate().toString().padStart(2, "0")}` as AucklandDate;
}

function midnightUtc(date: AucklandDate): Date {
  const [year, month, day] = parseAucklandDate(date);
  const wallTime = utcWallTime(year, month, day);

  // Solve local-midnight = UTC + offset. Re-read the offset at the candidate
  // because the offset is calendar-dependent and can change with DST. This is
  // deliberately boundary-based; it never assumes a day lasts 24 hours.
  let candidate = wallTime;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const adjusted = wallTime - offsetAt(new Date(candidate));
    if (adjusted === candidate) {
      const resolved = new Date(candidate);
      if (localDateAt(resolved) === date && partsAt(resolved).hour === 0) {
        return resolved;
      }
    }
    candidate = adjusted;
  }

  throw new RangeError(`Could not resolve Auckland midnight for ${date}.`);
}

function buildDay(localDate: AucklandDate): AucklandDay {
  const startUtc = midnightUtc(localDate);
  const nextMidnightUtc = midnightUtc(nextAucklandDate(localDate));
  return {
    localDate,
    startUtc,
    nextMidnightUtc,
    postingWindow: {
      startUtc,
      endUtcExclusive: nextMidnightUtc,
    },
  };
}

export function createAucklandDayService(clock: ClockLike = systemClock): AucklandDayService {
  return {
    current: () => {
      const now = readClock(clock);
      return buildDay(localDateAt(now));
    },
    forInstant: (instant: Date) => {
      if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
        throw new TypeError("The instant must be a valid Date.");
      }
      return buildDay(localDateAt(instant));
    },
  };
}

export function getAucklandDay(clock: ClockLike = systemClock): AucklandDay {
  return createAucklandDayService(clock).current();
}


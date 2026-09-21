import { createAucklandDayService } from "./auckland-day.js";

const instant = (value: string) => new Date(value);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function same<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message}: references differ`);
}

const tests: Array<[string, () => void]> = [
  ["uses Auckland midnight as an inclusive start and the next midnight as an exclusive end", () => {
    const service = createAucklandDayService({ now: () => instant("2026-09-10T11:59:59.999Z") });
    const day = service.current();

    equal(day.localDate, "2026-09-10", "local date");
    equal(day.startUtc.toISOString(), "2026-09-09T12:00:00.000Z", "start UTC");
    equal(day.nextMidnightUtc.toISOString(), "2026-09-10T12:00:00.000Z", "next midnight UTC");
    same(day.postingWindow.startUtc, day.startUtc, "posting start");
    same(day.postingWindow.endUtcExclusive, day.nextMidnightUtc, "posting end");
    equal(day.nextMidnightUtc.getTime() - day.startUtc.getTime(), 24 * 60 * 60 * 1000, "day length");
  }],

  ["handles the 23-hour NZ spring-forward day without adding 24 hours", () => {
    const day = createAucklandDayService({ now: () => instant("2026-09-27T00:30:00Z") }).current();

    equal(day.localDate, "2026-09-27", "local date");
    equal(day.startUtc.toISOString(), "2026-09-26T12:00:00.000Z", "start UTC");
    equal(day.nextMidnightUtc.toISOString(), "2026-09-27T11:00:00.000Z", "next midnight UTC");
    equal(day.nextMidnightUtc.getTime() - day.startUtc.getTime(), 23 * 60 * 60 * 1000, "day length");
  }],

  ["handles the 25-hour NZ fall-back day without adding 24 hours", () => {
    const day = createAucklandDayService({ now: () => instant("2026-04-04T12:30:00Z") }).current();

    equal(day.localDate, "2026-04-05", "local date");
    equal(day.startUtc.toISOString(), "2026-04-04T11:00:00.000Z", "start UTC");
    equal(day.nextMidnightUtc.toISOString(), "2026-04-05T12:00:00.000Z", "next midnight UTC");
    equal(day.nextMidnightUtc.getTime() - day.startUtc.getTime(), 25 * 60 * 60 * 1000, "day length");
  }],

  ["resolves leap-day boundaries by calendar date", () => {
    const day = createAucklandDayService({ now: () => instant("2028-02-29T10:00:00Z") }).current();

    equal(day.localDate, "2028-02-29", "local date");
    equal(day.startUtc.toISOString(), "2028-02-28T11:00:00.000Z", "start UTC");
    equal(day.nextMidnightUtc.toISOString(), "2028-02-29T11:00:00.000Z", "next midnight UTC");
  }],

  ["uses server clock authority even when a device clock would report another day", () => {
    const serverClock = { now: () => instant("2026-09-10T12:00:00Z") };
    const deviceClock = instant("2026-09-09T11:59:59Z");
    const day = createAucklandDayService(serverClock).current();

    equal(day.localDate, "2026-09-11", "server local date");
    assert(day.localDate !== deviceClock.toISOString().slice(0, 10), "device time changed the result");
    equal(day.startUtc.toISOString(), "2026-09-10T12:00:00.000Z", "server-derived start UTC");
  }],

  ["can resolve a supplied server instant while keeping the injected clock independent", () => {
    const service = createAucklandDayService({ now: () => instant("2026-09-10T12:00:00Z") });

    equal(service.forInstant(instant("2026-04-05T11:59:59.999Z")).localDate, "2026-04-05", "pre-midnight date");
    equal(service.forInstant(instant("2026-04-05T12:00:00Z")).localDate, "2026-04-06", "midnight date");
  }],
];

for (const [name, run] of tests) {
  run();
  console.log(`ok - ${name}`);
}

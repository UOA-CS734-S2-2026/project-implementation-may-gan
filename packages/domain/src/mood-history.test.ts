import { moodHistoryWindow, summarizeMoodHistory } from "./mood-history.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const tests: Array<[string, () => void]> = [
  ["ends each range today and puts the previous range just before it", () => {
    const thirty = moodHistoryWindow("30d", "2026-09-30");
    equal(thirty.from, "2026-09-01", "30d from");
    equal(thirty.to, "2026-09-30", "30d to");
    equal(thirty.previousFrom, "2026-08-02", "30d previous from");
    equal(thirty.previousTo, "2026-08-31", "30d previous to");

    const year = moodHistoryWindow("1y", "2028-03-01");
    equal(year.from, "2027-03-03", "1y from across a leap day");
    equal(moodHistoryWindow("90d", "2026-09-30").from, "2026-07-03", "90d from");
  }],

  ["summarises posted days and leaves the rest out of the points", () => {
    const history = summarizeMoodHistory("30d", "2026-09-30", "2026-01-01", [
      { localDate: "2026-09-28", rating: 8 },
      { localDate: "2026-09-30", rating: 5 },
      { localDate: "2026-09-10", rating: 6 },
    ]);

    equal(history.days.map((day) => day.localDate).join(), "2026-09-10,2026-09-28,2026-09-30", "points oldest first");
    equal(history.current.trackedDays, 30, "tracked");
    equal(history.current.postedDays, 3, "posted");
    equal(history.current.missingDays, 27, "missing");
    equal(history.current.average, 6.3, "average to one decimal");
    equal(history.current.lowest, 5, "lowest");
    equal(history.current.highest, 8, "highest");
  }],

  ["does not count today as missing while it is still open", () => {
    const history = summarizeMoodHistory("30d", "2026-09-30", "2026-01-01", [{ localDate: "2026-09-29", rating: 7 }]);

    equal(history.current.postedDays, 1, "posted");
    equal(history.current.missingDays, 28, "missing excludes today");
  }],

  ["compares with the previous range, which never includes today", () => {
    const history = summarizeMoodHistory("30d", "2026-09-30", "2026-01-01", [
      { localDate: "2026-08-31", rating: 4 },
      { localDate: "2026-08-02", rating: 6 },
      { localDate: "2026-08-01", rating: 10 },
      { localDate: "2026-09-01", rating: 9 },
    ]);

    equal(history.previous.from, "2026-08-02", "previous from");
    equal(history.previous.postedDays, 2, "previous posted");
    equal(history.previous.average, 5, "previous average");
    equal(history.previous.missingDays, 28, "previous missing");
    equal(history.current.average, 9, "current average");
  }],

  ["starts tracking on the account's first day", () => {
    const history = summarizeMoodHistory("90d", "2026-09-30", "2026-09-21", [{ localDate: "2026-09-21", rating: 7 }]);

    equal(history.trackedFrom, "2026-09-21", "tracked from");
    equal(history.current.trackedDays, 10, "tracked");
    equal(history.current.missingDays, 8, "missing");
    equal(history.previous.trackedDays, 0, "previous tracked");
    equal(history.previous.missingDays, 0, "previous missing");
    equal(history.previous.average, null, "previous average");
  }],

  ["has no average without posts", () => {
    const history = summarizeMoodHistory("30d", "2026-09-30", "2026-09-30", []);

    equal(history.days.length, 0, "points");
    equal(history.current.trackedDays, 1, "tracked");
    equal(history.current.missingDays, 0, "missing");
    equal(history.current.average, null, "average");
    equal(history.current.lowest, null, "lowest");
  }],

  ["ignores days after today and a tracking start in the future", () => {
    const history = summarizeMoodHistory("30d", "2026-09-30", "2026-10-05", [{ localDate: "2026-10-01", rating: 9 }]);

    equal(history.trackedFrom, "2026-09-30", "tracked from is capped at today");
    equal(history.days.length, 0, "points");
  }],
];

for (const [name, run] of tests) {
  run();
  console.log(`ok - ${name}`);
}

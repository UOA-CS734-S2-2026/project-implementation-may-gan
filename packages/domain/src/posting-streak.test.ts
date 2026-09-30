import { calculatePostingStreak } from "./posting-streak.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}

const tests: Array<[string, () => void]> = [
  ["is empty with no posts", () => {
    const streak = calculatePostingStreak([], "2026-09-30");

    equal(streak.current, 0, "current");
    equal(streak.longest, 0, "longest");
    equal(streak.lastPostDate, null, "last post");
    equal(streak.postedToday, false, "posted today");
  }],

  ["counts a run ending today", () => {
    const streak = calculatePostingStreak(["2026-09-28", "2026-09-29", "2026-09-30"], "2026-09-30");

    equal(streak.current, 3, "current");
    equal(streak.longest, 3, "longest");
    equal(streak.lastPostDate, "2026-09-30", "last post");
    equal(streak.postedToday, true, "posted today");
  }],

  ["keeps yesterday's run while today is still open", () => {
    const streak = calculatePostingStreak(["2026-09-28", "2026-09-29"], "2026-09-30");

    equal(streak.current, 2, "current");
    equal(streak.postedToday, false, "posted today");
  }],

  ["resets after a whole missed day but keeps the longest", () => {
    const streak = calculatePostingStreak(["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-28"], "2026-09-30");

    equal(streak.current, 0, "current");
    equal(streak.longest, 3, "longest");
    equal(streak.lastPostDate, "2026-09-28", "last post");
  }],

  ["counts a duplicated day once, in any order", () => {
    const streak = calculatePostingStreak(["2026-09-30", "2026-09-29", "2026-09-30"], "2026-09-30");

    equal(streak.current, 2, "current");
    equal(streak.longest, 2, "longest");
  }],

  ["crosses a leap day", () => {
    equal(calculatePostingStreak(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01").current, 3, "current");
  }],

  ["crosses the start and end of NZ daylight saving", () => {
    equal(calculatePostingStreak(["2026-09-26", "2026-09-27", "2026-09-28"], "2026-09-28").current, 3, "spring forward");
    equal(calculatePostingStreak(["2027-04-03", "2027-04-04", "2027-04-05"], "2027-04-05").current, 3, "fall back");
  }],

  ["ignores days after today", () => {
    const streak = calculatePostingStreak(["2026-09-30", "2026-10-01"], "2026-09-30");

    equal(streak.current, 1, "current");
    equal(streak.lastPostDate, "2026-09-30", "last post");
  }],
];

for (const [name, run] of tests) {
  run();
  console.log(`ok - ${name}`);
}

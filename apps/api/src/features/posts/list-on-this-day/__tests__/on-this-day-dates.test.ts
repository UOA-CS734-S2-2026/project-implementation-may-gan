import { describe, expect, it } from "vitest";
import { EARLIEST_MEMORY_YEAR, onThisDayCandidates } from "../on-this-day-dates";

describe("onThisDayCandidates", () => {
  it("lists the same month and day in earlier years, newest first, without the current year", () => {
    const candidates = onThisDayCandidates("2027-09-26");

    expect(candidates.slice(0, 3)).toEqual([
      { localDate: "2026-09-26", yearsAgo: 1 },
      { localDate: "2025-09-26", yearsAgo: 2 },
      { localDate: "2024-09-26", yearsAgo: 3 },
    ]);
    expect(candidates.some((candidate) => candidate.localDate.startsWith("2027"))).toBe(false);
    expect(candidates.at(-1)?.localDate.startsWith(String(EARLIEST_MEMORY_YEAR))).toBe(true);
  });

  it("does not roll 29 February into 28 February or 1 March", () => {
    const dates = onThisDayCandidates("2027-02-28").map((candidate) => candidate.localDate);

    expect(dates).toContain("2024-02-28");
    expect(dates).not.toContain("2024-02-29");
    expect(onThisDayCandidates("2027-03-01").map((candidate) => candidate.localDate)).not.toContain("2024-02-29");
  });

  it("includes only earlier leap years when today is 29 February", () => {
    const candidates = onThisDayCandidates("2028-02-29");

    expect(candidates.slice(0, 3)).toEqual([
      { localDate: "2024-02-29", yearsAgo: 4 },
      { localDate: "2020-02-29", yearsAgo: 8 },
      { localDate: "2016-02-29", yearsAgo: 12 },
    ]);
    expect(candidates.map((candidate) => candidate.localDate)).not.toContain("2027-02-29");
    // 2100 is not a leap year, so it is never a candidate for a later 29 February.
    expect(onThisDayCandidates("2104-02-29").map((candidate) => candidate.localDate)).not.toContain("2100-02-29");
  });

  it("rejects a date that does not exist", () => {
    expect(() => onThisDayCandidates("2027-02-29" as never)).toThrow(RangeError);
    expect(() => onThisDayCandidates("not-a-date" as never)).toThrow(RangeError);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createAucklandDayService } from "@dayli/domain";
import {
  createCurrentPostingDayService,
  type DailyPromptRecord,
  type DailyPromptRepository,
  MissingDailyPromptError,
} from "../get-current-posting-day.service";

function scheduledRepository(rows: DailyPromptRecord[]): DailyPromptRepository {
  return {
    async findActivePrompt(monthDay, localDate) {
      return rows
        .filter((row) => row.id.startsWith(`prompt-${monthDay}`) && row.effectiveDate <= localDate)
        .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate) || right.version - left.version)[0] ?? null;
    },
  };
}

describe("current posting-day service", () => {
  it("selects the newest approved version effective on the server Auckland date", async () => {
    const clock = { now: () => new Date("2028-02-29T10:00:00.000Z") };
    const service = createCurrentPostingDayService({
      clock,
      dayService: createAucklandDayService(clock),
      prompts: scheduledRepository([
        { id: "prompt-02-29", text: "v1", version: 1, effectiveDate: "1970-01-01" },
        { id: "prompt-02-29-v2", text: "v2", version: 2, effectiveDate: "2028-02-29" },
        { id: "prompt-02-29-v3", text: "future", version: 3, effectiveDate: "2028-03-01" },
      ]),
      hasPosted: async () => false,
      onOperationalAlert: vi.fn(),
    });

    await expect(service.getCurrentPostingDay("user-1")).resolves.toMatchObject({
      localDate: "2028-02-29",
      prompt: { id: "prompt-02-29-v2", text: "v2" },
      hasPosted: false,
    });
  });

  it("reports a missing prompt as an operational failure", async () => {
    const alert = vi.fn();
    const clock = { now: () => new Date("2028-02-29T10:00:00.000Z") };
    const service = createCurrentPostingDayService({
      clock,
      dayService: createAucklandDayService(clock),
      prompts: { findActivePrompt: async () => null },
      hasPosted: async () => false,
      onOperationalAlert: alert,
    });

    await expect(service.getCurrentPostingDay("private-user-id")).rejects.toBeInstanceOf(MissingDailyPromptError);
    expect(alert).toHaveBeenCalledWith({ code: "MISSING_DAILY_PROMPT", localDate: "2028-02-29", monthDay: "02-29" });
    expect(JSON.stringify(alert.mock.calls)).not.toContain("private-user-id");
  });

  it.each([
    [
      "the ordinary midnight rollover",
      "2028-02-28T10:59:59.999Z",
      "2028-02-28",
      "02-28",
      "2028-02-28T11:00:00.000Z",
    ],
    [
      "the 23-hour spring-forward day",
      "2026-09-27T00:30:00.000Z",
      "2026-09-27",
      "09-27",
      "2026-09-27T11:00:00.000Z",
    ],
    [
      "the 25-hour fall-back day",
      "2026-04-05T12:30:00.000Z",
      "2026-04-06",
      "04-06",
      "2026-04-06T12:00:00.000Z",
    ],
  ])("uses server calendar boundaries for %s", async (_name, now, localDate, monthDay, deadlineAt) => {
    const clock = { now: () => new Date(now) };
    const seen: { monthDay?: string; localDate?: string } = {};
    const service = createCurrentPostingDayService({
      clock,
      dayService: createAucklandDayService(clock),
      prompts: {
        findActivePrompt: async (requestedMonthDay, requestedLocalDate) => {
          seen.monthDay = requestedMonthDay;
          seen.localDate = requestedLocalDate;
          return { id: `prompt-${requestedMonthDay}`, text: "Prompt", version: 1, effectiveDate: "1970-01-01" };
        },
      },
      hasPosted: async () => false,
      onOperationalAlert: vi.fn(),
    });

    await expect(service.getCurrentPostingDay("user-1")).resolves.toMatchObject({
      localDate,
      deadlineAt: new Date(deadlineAt),
      releaseAt: new Date(deadlineAt),
    });
    expect(seen).toEqual({ monthDay, localDate });
  });
});

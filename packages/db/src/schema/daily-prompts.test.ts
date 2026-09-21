import { describe, expect, it } from "vitest";
import {
  DAILY_PROMPT_SOURCE,
  DAILY_PROMPT_SOURCE_COMMIT,
  DAILY_PROMPT_VERSION_1_EFFECTIVE_DATE,
  dailyPromptCatalog,
  dailyPrompts,
  selectDailyPromptVersion,
  validateDailyPromptCatalog,
} from "./daily-prompts";

describe("daily prompt catalog", () => {
  it("contains one attributed version-one prompt for every Auckland month-day", () => {
    expect(dailyPromptCatalog).toHaveLength(366);
    expect(dailyPromptCatalog[0]).toMatchObject({
      id: "prompt-01-01",
      monthDay: "01-01",
      version: 1,
      effectiveDate: DAILY_PROMPT_VERSION_1_EFFECTIVE_DATE,
      source: DAILY_PROMPT_SOURCE,
      sourceCommit: DAILY_PROMPT_SOURCE_COMMIT,
    });
    expect(dailyPromptCatalog[58]).toMatchObject({ id: "prompt-02-28", monthDay: "02-28" });
    expect(dailyPromptCatalog[59]).toMatchObject({ id: "prompt-02-29", monthDay: "02-29" });
    expect(dailyPromptCatalog[365]).toMatchObject({ id: "prompt-12-31", monthDay: "12-31" });
    expect(new Set(dailyPromptCatalog.map((prompt) => prompt.id)).size).toBe(366);
    expect(new Set(dailyPromptCatalog.map((prompt) => prompt.monthDay)).size).toBe(366);
    expect(dailyPromptCatalog.filter((prompt) => prompt.text === "What are you proud of today?")).toHaveLength(2);
  });

  it("rejects missing or reordered days before seed data can be generated", () => {
    expect(() => validateDailyPromptCatalog(dailyPromptCatalog.slice(0, -1))).toThrow("Expected 366");
    const duplicate = [...dailyPromptCatalog];
    duplicate[1] = { ...duplicate[1], monthDay: "01-01" };
    expect(() => validateDailyPromptCatalog(duplicate)).toThrow("unexpected month-day");
  });

  it("exports the versioned immutable table shape", () => {
    expect(dailyPrompts).toBeDefined();
    expect(dailyPrompts.id).toBeDefined();
    expect(dailyPrompts.version).toBeDefined();
    expect(dailyPrompts.effectiveDate).toBeDefined();
  });

  it("selects the latest scheduled version without changing historical text", () => {
    const futureVersion = {
      ...dailyPromptCatalog[0],
      id: "prompt-01-01-v2",
      version: 2,
      text: "A future prompt",
      effectiveDate: "2099-01-01",
    };
    const scheduled = [dailyPromptCatalog[0], futureVersion];
    expect(selectDailyPromptVersion(scheduled, "01-01", "2098-12-31")?.id).toBe("prompt-01-01");
    expect(selectDailyPromptVersion(scheduled, "01-01", "2099-01-01")?.id).toBe("prompt-01-01-v2");
    expect(selectDailyPromptVersion(scheduled, "01-01", "1969-12-31")).toBeUndefined();
    expect(dailyPromptCatalog[0].text).not.toBe(futureVersion.text);
  });
});

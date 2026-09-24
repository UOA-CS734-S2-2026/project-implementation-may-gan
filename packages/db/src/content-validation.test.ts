import { describe, expect, it } from "vitest";
import { validateDailyPostContent } from "./content-validation";

const validContent = {
  rating: 8,
  reflectiveAnswer: "A useful reflection",
  caption: "A short caption",
  tomorrowNote: "Remember this tomorrow",
  audience: "solo",
} as const;

describe("daily post content contract", () => {
  it("accepts valid content and both explicit audiences", () => {
    expect(validateDailyPostContent(validContent)).toEqual({ ok: true, value: validContent });
    expect(validateDailyPostContent({ ...validContent, audience: "friends" }).ok).toBe(true);
  });

  it("requires a trimmed reflective answer and bounds rating", () => {
    expect(validateDailyPostContent({ ...validContent, rating: 10.5 })).toMatchObject({
      ok: false,
      issues: [{ field: "rating", code: "integer" }],
    });
    expect(validateDailyPostContent({ ...validContent, rating: 11 })).toMatchObject({
      ok: false,
      issues: [{ field: "rating", code: "range" }],
    });
    expect(validateDailyPostContent({ ...validContent, reflectiveAnswer: "  answer" })).toMatchObject({
      ok: false,
      issues: [{ field: "reflectiveAnswer", code: "trimmed" }],
    });
  });

  it("counts Unicode code points for bounded fields", () => {
    const tooLongAnswer = "🙂".repeat(4_001);
    const tooLongNote = "🙂".repeat(1_001);
    expect(validateDailyPostContent({ ...validContent, reflectiveAnswer: tooLongAnswer })).toMatchObject({ ok: false });
    expect(validateDailyPostContent({ ...validContent, tomorrowNote: tooLongNote })).toMatchObject({ ok: false });
  });

  it("rejects missing optional-field types and an implicit audience", () => {
    expect(validateDailyPostContent({ ...validContent, caption: 42 })).toMatchObject({ ok: false });
    expect(validateDailyPostContent({ ...validContent, audience: undefined })).toMatchObject({ ok: false });
  });
});

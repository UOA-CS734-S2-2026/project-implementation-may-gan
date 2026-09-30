import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileStreak } from "@/features/profiles/get-profile-details/ProfileStreak";
import type { ProfileDetails } from "@/features/profiles/shared/profiles.api";

// The generated type drops the API's nullability, so build the wire shape.
const streak = (current: number, longest: number, postedToday = false) => ({
  current,
  longest,
  lastPostDate: longest ? "2026-09-30" : null,
  postedToday,
  asOf: "2026-09-30",
}) as unknown as ProfileDetails["streak"];

describe("ProfileStreak", () => {
  it("shows the current and longest streak, and today's post to the owner", () => {
    render(<ProfileStreak streak={streak(3, 5, true)} isMe />);

    expect(screen.getByText("3 days in a row")).toBeTruthy();
    expect(screen.getByText("Longest: 5 days")).toBeTruthy();
    expect(screen.getByText("Today's dayli is in.")).toBeTruthy();
  });

  it("shows only the longest after a missed day", () => {
    render(<ProfileStreak streak={streak(0, 1)} isMe={false} />);

    expect(screen.queryByText(/in a row/)).toBeNull();
    expect(screen.getByText("Longest: 1 day")).toBeTruthy();
  });

  it("has an empty state for the owner only", () => {
    const mine = render(<ProfileStreak streak={streak(0, 0)} isMe />);
    expect(screen.getByText("Your streak starts with your first dayli.")).toBeTruthy();
    mine.unmount();

    const { container } = render(<ProfileStreak streak={streak(0, 0)} isMe={false} />);
    expect(container.textContent).toBe("");
  });

  it("shows nothing when the streak is hidden", () => {
    const { container } = render(<ProfileStreak streak={null as unknown as ProfileDetails["streak"]} isMe={false} />);

    expect(container.textContent).toBe("");
  });
});

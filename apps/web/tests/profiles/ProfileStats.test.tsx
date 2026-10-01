import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProfileStats } from "@/features/profiles/get-profile-details/ProfileStats";
import type { ProfileDetails } from "@/features/profiles/shared/profiles.api";

// The generated types drop the API's nullability, so build the wire shape.
function profile(stats: { posts: number; friends: number } | null, current = 0) {
  return {
    stats,
    streak: stats ? { current, longest: current, lastPostDate: null, postedToday: false, asOf: "2026-09-30" } : null,
  } as unknown as Pick<ProfileDetails, "stats" | "streak">;
}

describe("ProfileStats", () => {
  it("shows posts, friends, and the day streak", () => {
    render(<ProfileStats profile={profile({ posts: 4, friends: 13 }, 3)} />);

    expect(screen.getByText("4").nextSibling?.textContent).toBe("Posts");
    expect(screen.getByText("13").nextSibling?.textContent).toBe("Friends");
    const streak = screen.getByText("3");
    expect(streak.nextSibling?.textContent).toBe("Day streak");
    expect(streak.className).toContain("text-orange-500");
  });

  it("uses singular labels and links friends for the owner", () => {
    render(<ProfileStats profile={profile({ posts: 1, friends: 1 })} friendsHref="/u/me/friends" />);

    expect(screen.getByText("Post")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/u/me/friends");
  });

  it("shows nothing when the details are hidden", () => {
    const { container } = render(<ProfileStats profile={profile(null)} />);

    expect(container.textContent).toBe("");
  });
});

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  loadSocialProfile: vi.fn(),
  getRelationship: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
}));
vi.mock("@/lib/api/friends", () => api);
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "actor" } }) }));
vi.mock("@/features/posts/list-profile-posts/ProfilePosts", () => ({
  ProfilePosts: ({ username }: { username: string }) => <p>posts for {username}</p>,
}));

import { Profile } from "./ClientPage";

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Profile username="ada" /></QueryClientProvider>);
}

describe("social profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a friend's posts and asks anyone else to add them first", async () => {
    api.loadSocialProfile.mockResolvedValueOnce({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "friends" } });
    const friend = renderProfile();
    expect(await screen.findByText("posts for ada")).toBeTruthy();
    friend.unmount();

    api.loadSocialProfile.mockResolvedValueOnce({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "none" } });
    renderProfile();
    expect(await screen.findByText("Add Ada as a friend to see their daylies.")).toBeTruthy();
    expect(screen.queryByText("posts for ada")).toBeNull();
  });


  it("reports a failed removal instead of treating the failed API result as success", async () => {
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "friends" } });
    api.removeFriend.mockResolvedValue({ ok: false, failure: "network" });
    const actor = userEvent.setup();
    renderProfile();
    await actor.click(await screen.findByRole("button", { name: "remove friend" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Friendship action failed. Please try again.");
    expect(api.removeFriend).toHaveBeenCalledWith("ada");
    expect(api.loadSocialProfile).toHaveBeenCalledTimes(1);
  });
});

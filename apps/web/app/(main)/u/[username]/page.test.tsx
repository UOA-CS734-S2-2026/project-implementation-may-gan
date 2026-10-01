import { render, screen, waitFor, within } from "@testing-library/react";
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
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
const profiles = vi.hoisted(() => ({ profilesApi: { details: vi.fn(), update: vi.fn(), changeUsername: vi.fn() } }));
vi.mock("@/features/profiles/shared/profiles.api", () => profiles);
vi.mock("@/features/posts/list-profile-posts/ProfilePosts", () => ({
  ProfilePosts: ({ username }: { username: string }) => <p>posts for {username}</p>,
}));

import { Profile } from "./ClientPage";

function details(overrides: Partial<{ username: string; detailsVisible: boolean; bio: string | null }> = {}) {
  return { ok: true, value: { id: "ada", username: "ada", displayName: "Ada", detailsVisible: true, bio: "Counts things.", owner: null, ...overrides } };
}

function renderProfile(username = "ada") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Profile username={username} /></QueryClientProvider>);
}

describe("social profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    profiles.profilesApi.details.mockResolvedValue(details());
  });

  it("asks before removing a friend", async () => {
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "friends" } });
    const actor = userEvent.setup();
    renderProfile();

    await actor.click(await screen.findByRole("button", { name: "friends" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Are you sure you want to remove @ada from your friends?");
    expect(api.removeFriend).not.toHaveBeenCalled();

    await actor.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.removeFriend).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "message" }).getAttribute("href")).toBe("/messages/new/ada");
  });

  it("shows a visible bio, or says the profile is private", async () => {
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "none" } });
    const open = renderProfile();
    expect(await screen.findByText("Counts things.")).toBeTruthy();
    open.unmount();

    profiles.profilesApi.details.mockResolvedValue(details({ detailsVisible: false, bio: null }));
    renderProfile();
    expect(await screen.findByText("Ada's profile is private.")).toBeTruthy();
  });

  it("sends an old handle to the owner's current one", async () => {
    profiles.profilesApi.details.mockResolvedValue(details({ username: "ada_new" }));
    renderProfile("ada");

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/u/ada_new"));
    expect(api.loadSocialProfile).not.toHaveBeenCalled();
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
    await actor.click(await screen.findByRole("button", { name: "friends" }));
    await actor.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Friendship action failed. Please try again.");
    expect(api.removeFriend).toHaveBeenCalledWith("ada");
    expect(api.loadSocialProfile).toHaveBeenCalledTimes(1);
  });
});

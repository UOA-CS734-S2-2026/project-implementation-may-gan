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
let signedIn = true;
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: signedIn ? { id: "actor" } : null, isPending: false }) }));
const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/u/ada",
  useSearchParams: () => new URLSearchParams(query),
}));
const profiles = vi.hoisted(() => ({ profilesApi: { details: vi.fn(), update: vi.fn(), changeUsername: vi.fn() } }));
vi.mock("@/features/profiles/shared/profiles.api", () => profiles);
vi.mock("@/features/posts/list-profile-posts/ProfilePosts", () => ({ ProfilePosts: ({ username }: { username: string }) => <p>posts for {username}</p> }));

import { Profile } from "./ClientPage";

function authorized(overrides: Record<string, unknown> = {}) {
  return { ok: true, value: { kind: "authorized", id: "ada", username: "ada", displayName: "Ada", detailsVisible: true, bio: "Counts things.", avatarUrl: null, streak: null, stats: null, owner: null, mbti: null, whatIDo: null, listeningTo: null, ...overrides } };
}

function renderProfile(username = "ada") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><Profile username={username} /></QueryClientProvider>);
  return { ...view, client };
}

describe("public profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedIn = true;
    query = "";
    profiles.profilesApi.details.mockResolvedValue(authorized());
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "friends" } });
  });

  it("renders a public projection and archive without a session", async () => {
    signedIn = false;
    profiles.profilesApi.details.mockResolvedValue({ ok: true, value: { kind: "public", username: "ada", displayName: "Ada", bio: "Counts things.", avatarUrl: "/api/v1/profiles/ada/avatar", streak: { current: 4, longest: 9 } } });
    renderProfile();

    expect(await screen.findByText("Counts things.")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("posts for ada")).toBeTruthy();
    expect(screen.getByRole("link", { name: "add friend" }).getAttribute("href")).toBe("/sign-in?next=%2Fu%2Fada%3Fintent%3Dfriend-request");
    expect(api.loadSocialProfile).not.toHaveBeenCalled();
  });

  it("renders only the username and generic private state anonymously", async () => {
    signedIn = false;
    profiles.profilesApi.details.mockResolvedValue({ ok: true, value: { kind: "restricted", username: "ada" } });
    renderProfile();

    expect(await screen.findByRole("heading", { name: "@ada" })).toBeTruthy();
    expect(screen.getByText("This profile is private.")).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.queryByText("posts for ada")).toBeNull();
  });

  it("clears a cached archive when a profile becomes restricted", async () => {
    signedIn = false;
    profiles.profilesApi.details.mockResolvedValue({ ok: true, value: { kind: "public", username: "ada", displayName: "Ada", bio: null, avatarUrl: null, streak: null } });
    const { client } = renderProfile();
    await screen.findByRole("heading", { name: "Ada" });
    client.setQueryData(["posts", "anonymous", "profile", "ada"], { pages: [{ kind: "archive", items: [{ private: "content" }] }] });
    client.setQueryData(["profiles", "anonymous", "details", "ada"], { kind: "restricted", username: "ada" });

    expect(await screen.findByText("This profile is private.")).toBeTruthy();
    await waitFor(() => expect(client.getQueryData(["posts", "anonymous", "profile", "ada"])).toBeUndefined());
    expect(screen.queryByText("posts for ada")).toBeNull();
  });

  it("asks before removing an existing friend", async () => {
    const actor = userEvent.setup();
    renderProfile();

    await actor.click(await screen.findByRole("button", { name: "friends" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Are you sure you want to remove @ada from your friends?");
    expect(api.removeFriend).not.toHaveBeenCalled();
    await actor.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("refetches after sign-in and never submits the returned action", async () => {
    query = "intent=friend-request";
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "none" } });
    renderProfile();

    expect(await screen.findByText(/Review this profile/)).toBeTruthy();
    await waitFor(() => expect(profiles.profilesApi.details.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(api.sendFriendRequest).not.toHaveBeenCalled();
  });

  it("removes an unsupported intent from the address", async () => {
    query = "intent=delete-account";
    renderProfile();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/u/ada"));
  });
});

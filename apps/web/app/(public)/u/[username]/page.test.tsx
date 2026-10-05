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
let actorId: string | null = "actor";
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: actorId ? { id: actorId } : null, isPending: false }) }));
const replace = vi.fn();
let query = "";
let pathname = "/u/ada";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(query),
}));
const emptyPeriod = { from: "2026-09-01", to: "2026-09-30", trackedDays: 30, postedDays: 0, missingDays: 29, average: null, lowest: null, highest: null };
const profiles = vi.hoisted(() => ({ profilesApi: { details: vi.fn(), update: vi.fn(), changeUsername: vi.fn(), moodHistory: vi.fn() } }));
vi.mock("@/features/profiles/shared/profiles.api", () => profiles);
vi.mock("@/features/posts/list-profile-posts/ProfilePosts", () => ({ ProfilePosts: ({ username }: { username: string }) => <p>posts for {username}</p> }));

import { rememberPublicIntent } from "@/lib/routing/public-return-intent";
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
    profiles.profilesApi.moodHistory.mockResolvedValue({ ok: true, value: { range: "30d", trackedFrom: "2026-01-01", days: [], hiddenDays: [], current: emptyPeriod, previous: emptyPeriod } });
    vi.clearAllMocks();
    actorId = "actor";
    query = "";
    pathname = "/u/ada";
    window.sessionStorage.clear();
    profiles.profilesApi.details.mockResolvedValue(authorized());
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "friends" } });
  });

  it("renders a public projection and archive without a session", async () => {
    actorId = null;
    profiles.profilesApi.details.mockResolvedValue({ ok: true, value: { kind: "public", username: "ada", displayName: "Ada", bio: "Counts things.", avatarUrl: "/api/v1/profiles/ada/avatar", streak: { current: 4, longest: 9 } } });
    renderProfile();

    expect(await screen.findByText("Counts things.")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.getByText("posts for ada")).toBeTruthy();
    expect(screen.getByRole("link", { name: "add friend" }).getAttribute("href")).toBe("/sign-in?next=%2Fu%2Fada%3Fintent%3Dfriend-request");
    expect(api.loadSocialProfile).not.toHaveBeenCalled();
  });

  it("renders only the username and generic private state anonymously", async () => {
    actorId = null;
    profiles.profilesApi.details.mockResolvedValue({ ok: true, value: { kind: "restricted", username: "ada" } });
    renderProfile();

    expect(await screen.findByRole("heading", { name: "@ada" })).toBeTruthy();
    expect(screen.getByText("This profile is private.")).toBeTruthy();
    expect(screen.queryByText("Ada")).toBeNull();
    expect(screen.queryByText("posts for ada")).toBeNull();
  });

  it("clears a cached archive when a profile becomes restricted", async () => {
    actorId = null;
    profiles.profilesApi.details.mockResolvedValue({ ok: true, value: { kind: "public", username: "ada", displayName: "Ada", bio: null, avatarUrl: null, streak: null } });
    const { client } = renderProfile();
    await screen.findByRole("heading", { name: "Ada" });
    client.setQueryData(["posts", "anonymous", "profile", "ada"], { pages: [{ kind: "archive", items: [{ private: "content" }] }] });
    client.setQueryData(["profiles", "anonymous", "details", "ada"], { kind: "restricted", username: "ada" });

    expect(await screen.findByText("This profile is private.")).toBeTruthy();
    await waitFor(() => expect(client.getQueryData(["posts", "anonymous", "profile", "ada"])).toBeUndefined());
    expect(screen.queryByText("posts for ada")).toBeNull();
  });

  it("conceals and evicts a public profile when a refetch becomes blocked", async () => {
    actorId = null;
    profiles.profilesApi.details
      .mockResolvedValueOnce({ ok: true, value: { kind: "public", username: "ada", displayName: "Ada", bio: "Protected bio", avatarUrl: null, streak: null } })
      .mockResolvedValue({ ok: false, failure: { kind: "notFound" } });
    const { client } = renderProfile();
    expect(await screen.findByText("Protected bio")).toBeTruthy();
    client.setQueryData(["posts", "anonymous", "profile", "ada"], { pages: [{ kind: "archive", items: [{ protected: true }] }] });

    await client.refetchQueries({ queryKey: ["profiles", "anonymous", "details", "ada"] });
    expect(await screen.findByRole("heading", { name: "This profile is unavailable" })).toBeTruthy();
    expect(screen.queryByText("Protected bio")).toBeNull();
    await waitFor(() => {
      expect(client.getQueryData(["profiles", "anonymous", "details", "ada"])).toBeUndefined();
      expect(client.getQueryData(["posts", "anonymous", "profile", "ada"])).toBeUndefined();
    });
  });

  it("evicts a friend's authorized projection and archive after concealment", async () => {
    profiles.profilesApi.details.mockResolvedValueOnce(authorized()).mockResolvedValue({ ok: false, failure: { kind: "notFound" } });
    const { client } = renderProfile();
    expect(await screen.findByText("Counts things.")).toBeTruthy();
    client.setQueryData(["posts", "actor", "profile", "ada"], { pages: [{ kind: "archive", items: [{ protected: true }] }] });

    await client.refetchQueries({ queryKey: ["profiles", "actor", "details", "ada"] });
    expect(await screen.findByRole("heading", { name: "This profile is unavailable" })).toBeTruthy();
    await waitFor(() => {
      expect(client.getQueryData(["profiles", "actor", "details", "ada"])).toBeUndefined();
      expect(client.getQueryData(["posts", "actor", "profile", "ada"])).toBeUndefined();
    });
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
    rememberPublicIntent("/u/ada?intent=friend-request");
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "none" } });
    renderProfile();

    expect(await screen.findByText(/Review this profile/)).toBeTruthy();
    await waitFor(() => expect(profiles.profilesApi.details.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(api.sendFriendRequest).not.toHaveBeenCalled();
  });

  it("does not carry a consumed notice to another profile or actor", async () => {
    query = "intent=friend-request";
    rememberPublicIntent("/u/ada?intent=friend-request");
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "ada", username: "ada", displayName: "Ada", relationship: "none" } });
    const { rerender, client } = renderProfile();
    const show = (username: string) => rerender(<QueryClientProvider client={client}><Profile username={username} /></QueryClientProvider>);

    expect(await screen.findByText(/Review this profile/)).toBeTruthy();
    query = "";
    pathname = "/u/bea";
    profiles.profilesApi.details.mockResolvedValue(authorized({ id: "bea", username: "bea", displayName: "Bea" }));
    api.loadSocialProfile.mockResolvedValue({ ok: true, value: { id: "bea", username: "bea", displayName: "Bea", relationship: "none" } });
    show("bea");
    expect(screen.queryByText(/Review this profile/)).toBeNull();

    query = "intent=friend-request";
    rememberPublicIntent("/u/bea?intent=friend-request");
    show("bea");
    expect(await screen.findByText(/Review this profile/)).toBeTruthy();
    actorId = "replacement-actor";
    query = "";
    show("bea");
    expect(screen.queryByText(/Review this profile/)).toBeNull();
    expect(api.sendFriendRequest).not.toHaveBeenCalled();
  });

  it("discards an intent bound to another account", async () => {
    query = "intent=friend-request";
    rememberPublicIntent("/u/ada?intent=friend-request");
    const raw = [...Array(window.sessionStorage.length)].map((_, index) => window.sessionStorage.key(index)).find(Boolean)!;
    const state = JSON.parse(window.sessionStorage.getItem(raw)!);
    window.sessionStorage.setItem(raw, JSON.stringify({ ...state, actorId: "another-account" }));
    renderProfile();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/u/ada"));
    expect(screen.queryByText(/Review this profile/)).toBeNull();
  });

  it("removes an unsupported intent from the address", async () => {
    query = "intent=delete-account";
    renderProfile();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/u/ada"));
  });
});

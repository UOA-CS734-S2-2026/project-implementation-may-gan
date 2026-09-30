import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePosts } from "@/features/posts/list-profile-posts/ProfilePosts";
import { postsApi } from "@/features/posts/shared/posts.api";

const replace = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "me" }, session: { id: "me" }, isPending: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/features/posts/shared/posts.api", () => ({ postsApi: { get: vi.fn(), profilePage: vi.fn() } }));

const profilePage = postsApi.profilePage as unknown as ReturnType<typeof vi.fn>;

function render(ui: Parameters<typeof rtlRender>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function post(id: string, answer: string, overrides: { audience?: "solo" | "friends"; released?: boolean } = {}) {
  return {
    id,
    author: { id: "author-ada", username: "ada", displayName: "Ada" },
    localDate: "2026-09-25",
    prompt: { id: "prompt-09-25", text: "What made you smile today?" },
    reflectiveAnswer: answer,
    caption: null,
    rating: 7,
    audience: overrides.audience ?? "friends",
    acceptedAt: "2026-09-25T03:00:00.000Z",
    releasedAt: "2026-09-25T12:00:00.000Z",
    released: overrides.released ?? true,
    edited: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfilePosts", () => {
  it("labels the owner's solo and unreleased posts and loads the next page", async () => {
    const actor = userEvent.setup();
    profilePage
      .mockResolvedValueOnce({ ok: true, value: { items: [post("1", "Today, so far.", { released: false }), post("2", "Just for me.", { audience: "solo" })], nextCursor: "c1", hasMore: true } })
      .mockResolvedValueOnce({ ok: true, value: { items: [post("3", "Walked to the harbour.")], nextCursor: null, hasMore: false } });

    render(<ProfilePosts username="ada" displayName="Ada" isMe />);
    expect(await screen.findByText("Today, so far.")).toBeTruthy();
    expect(screen.getByText("Not released yet")).toBeTruthy();
    expect(screen.getByText("Only you")).toBeTruthy();
    expect(profilePage).toHaveBeenCalledWith("ada", undefined);

    await actor.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Walked to the harbour.")).toBeTruthy();
    expect(profilePage).toHaveBeenLastCalledWith("ada", "c1");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("opens each post from its card", async () => {
    profilePage.mockResolvedValue({ ok: true, value: { items: [post("1", "Walked to the harbour.")], nextCursor: null, hasMore: false } });

    render(<ProfilePosts username="ada" displayName="Ada" isMe={false} />);
    const link = await screen.findByRole("link", { name: /Open Ada's dayli/ });
    expect(link.getAttribute("href")).toBe("/u/ada/1");
  });

  it("uses different empty messages for the owner and a friend", async () => {
    profilePage.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null, hasMore: false } });

    const mine = render(<ProfilePosts username="me" displayName="Me" isMe />);
    expect(await screen.findByText(/You haven't posted a dayli yet/)).toBeTruthy();
    mine.unmount();

    render(<ProfilePosts username="ada" displayName="Ada" isMe={false} />);
    expect(await screen.findByText("Ada hasn't shared any daylies with you yet.")).toBeTruthy();
  });

  it("offers a retry after a failure", async () => {
    const actor = userEvent.setup();
    profilePage
      .mockResolvedValueOnce({ ok: false, failure: "network" })
      .mockResolvedValueOnce({ ok: true, value: { items: [post("1", "Walked to the harbour.")], nextCursor: null, hasMore: false } });

    render(<ProfilePosts username="ada" displayName="Ada" isMe={false} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("You seem to be offline");
    await actor.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Walked to the harbour.")).toBeTruthy();
  });

  it("sends a signed-out viewer to sign in", async () => {
    profilePage.mockResolvedValue({ ok: false, failure: "unauthenticated" });

    render(<ProfilePosts username="ada" displayName="Ada" isMe={false} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});

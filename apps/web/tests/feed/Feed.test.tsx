import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Feed } from "@/features/feed/list-feed/Feed";
import { feedApi } from "@/features/feed/shared/feed.api";

let userId = "me";
const replace = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: userId }, session: { id: userId }, isPending: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/features/feed/shared/feed.api", () => ({ feedApi: { page: vi.fn() } }));
vi.mock("@/features/posts/shared/posts.api", () => ({ postsApi: { media: vi.fn() } }));

const page = feedApi.page as unknown as ReturnType<typeof vi.fn>;

function render(ui: Parameters<typeof rtlRender>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...view, rerender: (next: Parameters<typeof rtlRender>[0]) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}

function post(id: string, answer: string, media: unknown[] = [], counts = { likeCount: 0, viewerHasLiked: false, commentCount: 0 }) {
  return {
    id,
    author: { id: `author-${id}`, username: `friend_${id}`, displayName: `Friend ${id}` },
    localDate: "2026-09-25",
    prompt: { id: "prompt-09-25", text: "What made you smile today?" },
    reflectiveAnswer: answer,
    caption: null,
    rating: 7,
    audience: "friends",
    acceptedAt: "2026-09-25T03:00:00.000Z",
    releasedAt: "2026-09-25T12:00:00.000Z",
    edited: false,
    ...counts,
    media,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userId = "me";
});

describe("Feed", () => {
  it("uses post-shaped skeletons while the feed loads", () => {
    page.mockReturnValue(new Promise(() => {}));
    render(<Feed />);

    expect(screen.getByRole("status", { name: "Loading friends' daylies" })).toBeTruthy();
    expect(document.querySelectorAll(".skeleton")).toHaveLength(42);
  });

  it("starts again from the new day when a page is loaded after midnight", async () => {
    const actor = userEvent.setup();
    page
      .mockResolvedValueOnce({ ok: true, value: { items: [post("1", "Walked to the harbour.")], nextCursor: "c1", hasMore: true, feedDate: "2026-09-25" } })
      .mockResolvedValueOnce({ ok: false, failure: "dayChanged" })
      .mockResolvedValueOnce({ ok: true, value: { items: [post("2", "Baked bread.")], nextCursor: null, hasMore: false, feedDate: "2026-09-26" } });

    render(<Feed />);
    expect(await screen.findByText("Walked to the harbour.")).toBeTruthy();

    await actor.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Baked bread.")).toBeTruthy();
    expect(screen.queryByText("Walked to the harbour.")).toBeNull();
    expect(page).toHaveBeenNthCalledWith(2, "c1");
    expect(page).toHaveBeenNthCalledWith(3, undefined);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows each card's likes and comments", async () => {
    page.mockResolvedValueOnce({
      ok: true,
      value: { items: [post("1", "Walked to the harbour.", [], { likeCount: 3, viewerHasLiked: true, commentCount: 1 })], nextCursor: null, hasMore: false },
    });

    render(<Feed />);

    expect(await screen.findByLabelText("3 likes, including yours")).toBeTruthy();
    expect(screen.getByLabelText("1 comment")).toBeTruthy();
  });

  it("shows friends' posts and loads the next page with the cursor", async () => {
    const actor = userEvent.setup();
    page
      .mockResolvedValueOnce({ ok: true, value: { items: [post("1", "Walked to the harbour.")], nextCursor: "c1", hasMore: true } })
      .mockResolvedValueOnce({ ok: true, value: { items: [post("1", "Walked to the harbour."), post("2", "Baked bread.")], nextCursor: null, hasMore: false } });

    render(<Feed />);
    expect(await screen.findByText("Walked to the harbour.")).toBeTruthy();
    expect(screen.getByText("@friend_1")).toBeTruthy();

    await actor.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Baked bread.")).toBeTruthy();
    expect(page).toHaveBeenLastCalledWith("c1");
    expect(screen.getAllByText("Walked to the harbour.")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("shows the prompt and a clamped answer, and opens the post from the whole card", async () => {
    const answer = "A long answer about the harbour that goes on well past three lines of the card.";
    page.mockResolvedValue({
      ok: true,
      value: { items: [{ ...post("1", answer), caption: "Low tide." }], nextCursor: null, hasMore: false },
    });

    render(<Feed />);
    const text = await screen.findByText(answer);
    expect(screen.getByText("What made you smile today?")).toBeTruthy();
    expect(text.className).toContain("line-clamp-3");
    // The word dump is only on the post page.
    expect(screen.queryByText("Low tide.")).toBeNull();
    expect(screen.queryByRole("button", { name: /see more/i })).toBeNull();

    expect(screen.getByRole("link", { name: /open friend 1's dayli/i }).getAttribute("href")).toBe("/u/friend_1/1");
    expect(screen.getByRole("link", { name: /@friend_1/ }).getAttribute("href")).toBe("/u/friend_1");
  });

  it("keeps an app-route username on the profile and post routes", async () => {
    page.mockResolvedValue({
      ok: true,
      value: {
        items: [{ ...post("2", "A dayli."), author: { id: "author-2", username: "messages", displayName: "Friend 2" } }],
        nextCursor: null,
        hasMore: false,
      },
    });

    render(<Feed />);
    expect((await screen.findByRole("link", { name: /open friend 2's dayli/i })).getAttribute("href")).toBe("/u/messages/2");
    expect(screen.getByRole("link", { name: /@messages/ }).getAttribute("href")).toBe("/u/messages");
  });

  it("shows an empty state when friends have no released posts", async () => {
    page.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null, hasMore: false } });

    render(<Feed />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers a retry after a failed load", async () => {
    const actor = userEvent.setup();
    page
      .mockResolvedValueOnce({ ok: false, failure: "network" })
      .mockResolvedValueOnce({ ok: true, value: { items: [post("1", "Back online.")], nextCursor: null, hasMore: false } });

    render(<Feed />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/offline/i);
    await actor.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Back online.")).toBeTruthy();
  });

  it("sends a signed-out user to sign in", async () => {
    page.mockResolvedValue({ ok: false, failure: "unauthenticated" });

    render(<Feed />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("never shows one account's feed to the next", async () => {
    page.mockResolvedValueOnce({ ok: true, value: { items: [post("1", "Private to me.")], nextCursor: null, hasMore: false } });
    const view = render(<Feed />);
    await screen.findByText("Private to me.");

    userId = "other";
    page.mockResolvedValueOnce({ ok: true, value: { items: [], nextCursor: null, hasMore: false } });
    view.rerender(<Feed />);
    await waitFor(() => expect(screen.queryByText("Private to me.")).toBeNull());
  });

  it("shows a card's first photo, and a play tile rather than autoplaying a video", async () => {
    const photo = { id: "m-1", contentType: "image/jpeg", order: 0, url: "https://storage.example.test/a?sig=1", expiresAt: "2026-09-26T03:05:00.000Z" };
    const video = { id: "m-2", contentType: "video/mp4", order: 0, url: "https://storage.example.test/v?sig=1", expiresAt: "2026-09-26T03:05:00.000Z" };
    page.mockResolvedValue({
      ok: true,
      value: {
        items: [post("1", "With a photo", [photo]), post("2", "With a video", [video]), post("3", "Just words")],
        nextCursor: null,
        hasMore: false,
      },
    });
    const view = render(<Feed />);

    const image = await screen.findByAltText("Friend 1's photo");
    expect(image.getAttribute("src")).toBe("https://storage.example.test/a?sig=1");
    expect(screen.getByText("Video")).toBeTruthy();
    expect(view.container.querySelector("video")).toBeNull();
  });
});

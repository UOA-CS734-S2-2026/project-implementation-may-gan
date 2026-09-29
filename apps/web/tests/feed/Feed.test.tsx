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

const page = feedApi.page as unknown as ReturnType<typeof vi.fn>;

function render(ui: Parameters<typeof rtlRender>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...view, rerender: (next: Parameters<typeof rtlRender>[0]) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}

function post(id: string, answer: string) {
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userId = "me";
});

describe("Feed", () => {
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

  it("shows the prompt and caption, and expands a post in place to read it in full", async () => {
    const actor = userEvent.setup();
    const answer = "A long answer about the harbour that goes on well past two lines of the card.";
    page.mockResolvedValue({
      ok: true,
      value: { items: [{ ...post("1", answer), caption: "Low tide." }], nextCursor: null, hasMore: false },
    });

    render(<Feed />);
    const text = await screen.findByText(answer);
    expect(screen.getByText("What made you smile today?")).toBeTruthy();
    expect(screen.getByText("Low tide.")).toBeTruthy();
    expect(text.className).toContain("line-clamp-2");
    expect(screen.queryByRole("link", { name: /see more/i })).toBeNull();

    await actor.click(screen.getByRole("button", { name: "See more" }));
    expect(screen.getByRole("button", { name: "See less" }).getAttribute("aria-expanded")).toBe("true");
    expect(text.className).not.toContain("line-clamp");

    await actor.click(screen.getByRole("button", { name: "See less" }));
    expect(text.className).toContain("line-clamp-2");
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
});

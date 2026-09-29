import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostDetailView } from "@/features/posts/get-post/PostDetailView";
import { postsApi } from "@/features/posts/shared/posts.api";

let userId = "me";
const replace = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: userId }, session: { id: userId }, isPending: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/features/posts/shared/posts.api", () => ({ postsApi: { get: vi.fn() } }));

const get = postsApi.get as unknown as ReturnType<typeof vi.fn>;

function render(ui: Parameters<typeof rtlRender>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    author: { id: "author-1", username: "ana_walks", displayName: "Ana" },
    localDate: "2026-09-29",
    prompt: { id: "prompt-09-29", text: "What made you smile today?" },
    reflectiveAnswer: "Walked the coastal track.",
    caption: "Tide was in.",
    rating: 8,
    audience: "friends",
    acceptedAt: "2026-09-29T03:00:00.000Z",
    releasedAt: "2026-09-29T11:00:00.000Z",
    edited: false,
    viewerIsAuthor: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userId = "me";
});

describe("PostDetailView", () => {
  it("shows the post with its stored prompt, rating, and Auckland date", async () => {
    get.mockResolvedValue({ ok: true, value: detail() });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    expect(await screen.findByText("Walked the coastal track.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What made you smile today?" })).toBeTruthy();
    expect(screen.getByText("Tide was in.")).toBeTruthy();
    expect(screen.getByLabelText("Rated 8 out of 10")).toBeTruthy();
    expect(screen.getByText(/Tuesday, 29 September 2026, 4:00 pm/)).toBeTruthy();
    expect(get).toHaveBeenCalledWith("post-1");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the author their audience and the edited marker", async () => {
    get.mockResolvedValue({ ok: true, value: detail({ audience: "solo", viewerIsAuthor: true, edited: true, caption: null }) });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    expect(await screen.findByText(/Edited · Only you/)).toBeTruthy();
    expect(screen.queryByText("Word dump")).toBeNull();
  });

  it("moves a link with another username to the author's address", async () => {
    get.mockResolvedValue({ ok: true, value: detail() });
    render(<PostDetailView username="someone_else" postId="post-1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/ana_walks/post-1"));
  });

  it("explains an unavailable post without revealing why", async () => {
    get.mockResolvedValue({ ok: false, failure: "notFound" });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    expect(await screen.findByText(/isn't available/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("retries after a failed load", async () => {
    const actor = userEvent.setup();
    get.mockResolvedValueOnce({ ok: false, failure: "network" }).mockResolvedValueOnce({ ok: true, value: detail() });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    expect((await screen.findByRole("alert")).textContent).toMatch(/offline/i);
    await actor.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Walked the coastal track.")).toBeTruthy();
  });

  it("sends a signed-out user to sign in", async () => {
    get.mockResolvedValue({ ok: false, failure: "unauthenticated" });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});

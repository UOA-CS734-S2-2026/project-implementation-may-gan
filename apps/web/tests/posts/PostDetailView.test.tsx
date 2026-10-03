import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostDetailView } from "@/features/posts/get-post/PostDetailView";
import { postsApi } from "@/features/posts/shared/posts.api";
import { rememberPublicIntent } from "@/lib/routing/public-return-intent";

let userId: string | null = "me";
let search = "";
const replace = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: userId ? { id: userId } : null, session: userId ? { id: userId } : null, isPending: false }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/u/ana_walks/post-1",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/features/posts/shared/posts.api", () => ({ postsApi: { get: vi.fn(), media: vi.fn() } }));

const get = postsApi.get as unknown as ReturnType<typeof vi.fn>;
const refresh = postsApi.media as unknown as ReturnType<typeof vi.fn>;

function render(ui: Parameters<typeof rtlRender>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...view, client };
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
    media: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  userId = "me";
  search = "";
  window.sessionStorage.clear();
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
    expect(screen.getByRole("link", { name: /@ana_walks/ }).getAttribute("href")).toBe("/u/ana_walks");
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

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/u/ana_walks/post-1"));
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

  it("renders a public post and offers safe sign-in actions without a session", async () => {
    userId = null;
    get.mockResolvedValue({ ok: true, value: detail() });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    expect(await screen.findByText("Walked the coastal track.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "like" }).getAttribute("href")).toBe("/sign-in?next=%2Fu%2Fana_walks%2Fpost-1%3Fintent%3Dlike");
    expect(screen.getByRole("link", { name: "comment" })).toBeTruthy();
  });

  it("refetches a returned intent without replaying a mutation", async () => {
    search = "intent=like";
    rememberPublicIntent("/u/ana_walks/post-1?intent=like");
    get.mockResolvedValue({ ok: true, value: detail() });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    expect(await screen.findByText(/Nothing was submitted/)).toBeTruthy();
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("conceals and evicts stale content and media after a 404 refetch", async () => {
    const protectedPost = detail({ media: [{ id: "m-1", contentType: "image/jpeg", order: 0, url: "/api/v1/posts/post-1/media/m-1", expiresAt: null }] });
    get.mockResolvedValueOnce({ ok: true, value: protectedPost }).mockResolvedValue({ ok: false, failure: "notFound" });
    const { client } = render(<PostDetailView username="ana_walks" postId="post-1" />);
    expect(await screen.findByText("Walked the coastal track.")).toBeTruthy();
    expect(screen.getByAltText("Ana's photo 1 of 1")).toBeTruthy();

    await client.refetchQueries({ queryKey: ["posts", "me", "detail", "post-1"] });
    expect(await screen.findByText(/isn't available/)).toBeTruthy();
    expect(screen.queryByText("Walked the coastal track.")).toBeNull();
    expect(screen.queryByAltText("Ana's photo 1 of 1")).toBeNull();
    await waitFor(() => expect(client.getQueryData(["posts", "me", "detail", "post-1"])).toBeUndefined());
  });

  describe("media", () => {
    const photo = (id: string, order: number) => ({
      id,
      contentType: "image/jpeg",
      order,
      url: `https://storage.example.test/${id}?sig=old`,
      expiresAt: "2026-09-29T03:05:00.000Z",
    });

    it("shows every photo in order", async () => {
      get.mockResolvedValue({ ok: true, value: detail({ media: [photo("m-1", 0), photo("m-2", 1)] }) });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      const first = await screen.findByAltText("Ana's photo 1 of 2");
      expect(first.getAttribute("src")).toBe("https://storage.example.test/m-1?sig=old");
      expect(screen.getByAltText("Ana's photo 2 of 2")).toBeTruthy();
    });

    it("autoplays and loops a video muted, with controls to unmute", async () => {
      const video = { ...photo("m-1", 0), contentType: "video/mp4" };
      get.mockResolvedValue({ ok: true, value: detail({ media: [video] }) });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      const player = await screen.findByLabelText("Ana's video");
      expect(player.tagName).toBe("VIDEO");
      expect(player.hasAttribute("controls")).toBe(true);
      expect(player.hasAttribute("autoplay")).toBe(true);
      expect(player.hasAttribute("loop")).toBe(true);
      // Browsers only allow autoplay without sound.
      expect((player as HTMLVideoElement).muted).toBe(true);
      expect(player.hasAttribute("playsinline")).toBe(true);
    });

    it("fetches a fresh URL once when a photo's link has expired", async () => {
      get.mockResolvedValue({ ok: true, value: detail({ media: [photo("m-1", 0)] }) });
      refresh.mockResolvedValue({ ok: true, value: { ...photo("m-1", 0), url: "https://storage.example.test/m-1?sig=new" } });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      fireEvent.error(await screen.findByAltText("Ana's photo 1 of 1"));
      await waitFor(() => expect(screen.getByAltText("Ana's photo 1 of 1").getAttribute("src"))
        .toBe("https://storage.example.test/m-1?sig=new"));
      expect(refresh).toHaveBeenCalledWith("post-1", "m-1");

      // A second failure gives up rather than retrying forever.
      fireEvent.error(screen.getByAltText("Ana's photo 1 of 1"));
      expect(await screen.findByText("Photo unavailable")).toBeTruthy();
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("shows a placeholder when storage gave no URL or the refresh is refused", async () => {
      get.mockResolvedValue({ ok: true, value: detail({ media: [{ ...photo("m-1", 0), url: null }, photo("m-2", 1)] }) });
      refresh.mockResolvedValue({ ok: false, failure: "notFound" });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      expect(await screen.findByText("Photo unavailable")).toBeTruthy();
      fireEvent.error(screen.getByAltText("Ana's photo 2 of 2"));
      await waitFor(() => expect(screen.getAllByText("Photo unavailable")).toHaveLength(2));
    });
  });
});

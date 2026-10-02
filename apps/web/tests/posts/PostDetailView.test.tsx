import { fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostDetailView } from "@/features/posts/get-post/PostDetailView";
import { postsApi } from "@/features/posts/shared/posts.api";

let userId = "me";
const replace = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: userId }, session: { id: userId }, isPending: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/features/posts/shared/posts.api", () => ({
  postsApi: { get: vi.fn(), media: vi.fn(), update: vi.fn(), remove: vi.fn(), revisions: vi.fn() },
}));

const get = postsApi.get as unknown as ReturnType<typeof vi.fn>;
const refresh = postsApi.media as unknown as ReturnType<typeof vi.fn>;
const update = postsApi.update as unknown as ReturnType<typeof vi.fn>;
const remove = postsApi.remove as unknown as ReturnType<typeof vi.fn>;
const revisions = postsApi.revisions as unknown as ReturnType<typeof vi.fn>;

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
    revisionCount: 0,
    viewerIsAuthor: false,
    media: [],
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
    expect(screen.getByRole("link", { name: /@ana_walks/ }).getAttribute("href")).toBe("/u/ana_walks");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the author their audience and the edited marker", async () => {
    get.mockResolvedValue({ ok: true, value: detail({ audience: "solo", viewerIsAuthor: true, edited: true, caption: null }) });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    expect(await screen.findByText(/· Only you/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edited · see earlier versions" })).toBeTruthy();
    expect(screen.queryByText("Word dump")).toBeNull();
  });

  it("gives only the author edit and delete controls", async () => {
    get.mockResolvedValue({ ok: true, value: detail() });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    await screen.findByText("Walked the coastal track.");
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  describe("editing", () => {
    it("saves every field with the revision count the author read", async () => {
      const actor = userEvent.setup();
      const saved = detail({ viewerIsAuthor: true, reflectiveAnswer: "Walked further.", caption: null, edited: true, revisionCount: 3 });
      get.mockResolvedValueOnce({ ok: true, value: detail({ viewerIsAuthor: true, revisionCount: 2 }) })
        .mockResolvedValue({ ok: true, value: saved });
      update.mockResolvedValue({ ok: true, value: saved });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      await actor.click(await screen.findByRole("button", { name: "Edit" }));
      const answer = screen.getByLabelText("What made you smile today?");
      await actor.clear(answer);
      await actor.type(answer, "Walked further.");
      await actor.clear(screen.getByLabelText("Word dump"));
      await actor.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(update).toHaveBeenCalledWith("post-1", {
        expectedRevisionCount: 2,
        reflectiveAnswer: "Walked further.",
        rating: 8,
        caption: null,
        audience: "friends",
      }));
      expect(await screen.findByText("Walked further.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    });

    it("keeps the author's changes through a conflict and saves against the latest version", async () => {
      const actor = userEvent.setup();
      get.mockResolvedValueOnce({ ok: true, value: detail({ viewerIsAuthor: true }) })
        .mockResolvedValue({ ok: true, value: detail({ viewerIsAuthor: true, reflectiveAnswer: "Edited elsewhere.", revisionCount: 1 }) });
      update.mockResolvedValueOnce({ ok: false, failure: "conflict" })
        .mockResolvedValue({ ok: true, value: detail({ viewerIsAuthor: true, reflectiveAnswer: "Walked the coastal track. Then home.", revisionCount: 2 }) });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      await actor.click(await screen.findByRole("button", { name: "Edit" }));
      const answer = () => screen.getByLabelText("What made you smile today?") as HTMLTextAreaElement;
      await actor.type(answer(), " Then home.");
      await actor.click(screen.getByRole("button", { name: "Save changes" }));

      expect((await screen.findByRole("alert")).textContent).toMatch(/edited somewhere else/);
      await actor.click(screen.getByRole("button", { name: "Load the latest version" }));
      expect((await screen.findByRole("status")).textContent).toMatch(/Your changes are still here/);
      expect(answer().value).toBe("Walked the coastal track. Then home.");

      await actor.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() => expect(update).toHaveBeenLastCalledWith("post-1", expect.objectContaining({ expectedRevisionCount: 1 })));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull());
    });

    it("cancels without saving", async () => {
      const actor = userEvent.setup();
      get.mockResolvedValue({ ok: true, value: detail({ viewerIsAuthor: true }) });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      await actor.click(await screen.findByRole("button", { name: "Edit" }));
      await actor.click(screen.getByRole("button", { name: "Cancel" }));

      expect(update).not.toHaveBeenCalled();
      expect(screen.getByText("Walked the coastal track.")).toBeTruthy();
    });
  });

  describe("deleting", () => {
    it("asks first, then deletes and returns to the author's profile", async () => {
      const actor = userEvent.setup();
      get.mockResolvedValue({ ok: true, value: detail({ viewerIsAuthor: true }) });
      remove.mockResolvedValue({ ok: true, value: undefined });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      await actor.click(await screen.findByRole("button", { name: "Delete" }));
      const dialog = screen.getByRole("alertdialog", { name: "Delete this dayli?" });
      expect(dialog.textContent).toMatch(/can't post this day again/);
      expect(remove).not.toHaveBeenCalled();
      await actor.click(within(dialog).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/u/ana_walks"));
      expect(remove).toHaveBeenCalledWith("post-1");
    });

    it("stays open with an error when deletion fails", async () => {
      const actor = userEvent.setup();
      get.mockResolvedValue({ ok: true, value: detail({ viewerIsAuthor: true }) });
      remove.mockResolvedValue({ ok: false, failure: "unavailable" });
      render(<PostDetailView username="ana_walks" postId="post-1" />);

      await actor.click(await screen.findByRole("button", { name: "Delete" }));
      await actor.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));

      expect((await within(screen.getByRole("alertdialog")).findByRole("alert")).textContent).toMatch(/couldn't be deleted/);
      expect(replace).not.toHaveBeenCalled();
    });
  });

  it("opens earlier versions from the edited marker", async () => {
    const actor = userEvent.setup();
    get.mockResolvedValue({ ok: true, value: detail({ edited: true, revisionCount: 1 }) });
    revisions.mockResolvedValue({
      ok: true,
      value: {
        items: [{
          revisionNumber: 1,
          reflectiveAnswer: "Walked the track.",
          caption: null,
          rating: 6,
          audience: "friends",
          replacedAt: new Date("2026-09-29T08:00:00.000Z"),
        }],
        nextCursor: null,
        hasMore: false,
      },
    });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    await actor.click(await screen.findByRole("button", { name: "Edited · see earlier versions" }));

    const history = await screen.findByRole("region", { name: "Earlier versions" });
    expect(within(history).getByText("Walked the track.")).toBeTruthy();
    expect(within(history).getByText(/Version 1 · replaced 29 Sept/)).toBeTruthy();
    expect(revisions).toHaveBeenCalledWith("post-1", undefined);
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

  it("sends a signed-out user to sign in", async () => {
    get.mockResolvedValue({ ok: false, failure: "unauthenticated" });
    render(<PostDetailView username="ana_walks" postId="post-1" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
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

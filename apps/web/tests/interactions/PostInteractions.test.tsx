import { render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostDetailView } from "@/features/posts/get-post/PostDetailView";
import { interactionsApi } from "@/features/interactions/shared/interactions.api";
import { postsApi } from "@/features/posts/shared/posts.api";

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "me" }, session: { id: "me" }, isPending: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/features/posts/shared/posts.api", () => ({
  postsApi: { get: vi.fn(), media: vi.fn(), update: vi.fn(), remove: vi.fn(), revisions: vi.fn() },
}));
vi.mock("@/features/interactions/shared/interactions.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/interactions/shared/interactions.api")>()),
  interactionsApi: {
    setLike: vi.fn(),
    likes: vi.fn(),
    comments: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  },
}));

const get = postsApi.get as unknown as ReturnType<typeof vi.fn>;
const api = interactionsApi as unknown as Record<keyof typeof interactionsApi, ReturnType<typeof vi.fn>>;

function render() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(
    <QueryClientProvider client={client}>
      <PostDetailView username="ana_walks" postId="post-1" />
    </QueryClientProvider>,
  );
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    author: { id: "author-1", username: "ana_walks", displayName: "Ana" },
    localDate: "2026-09-29",
    prompt: { id: "prompt-09-29", text: "What made you smile today?" },
    reflectiveAnswer: "Walked the coastal track.",
    caption: null,
    rating: 8,
    audience: "friends",
    acceptedAt: "2026-09-29T03:00:00.000Z",
    releasedAt: "2026-09-29T11:00:00.000Z",
    edited: false,
    revisionCount: 0,
    likeCount: 2,
    viewerHasLiked: false,
    commentCount: 0,
    viewerIsAuthor: false,
    media: [],
    ...overrides,
  };
}

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: "comment-1",
    postId: "post-1",
    parentCommentId: null,
    author: { id: "friend-1", username: "ben", displayName: "Ben" },
    text: "Beautiful.",
    createdAt: new Date("2026-09-29T20:00:00.000Z"),
    editedAt: null,
    viewerCanEdit: false,
    viewerCanDelete: false,
    ...overrides,
  };
}

const page = (items: unknown[]) => ({ ok: true, value: { items, nextCursor: null, hasMore: false } });

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ ok: true, value: detail() });
  api.comments.mockResolvedValue(page([]));
});

describe("likes", () => {
  it("likes at once and keeps the server's count", async () => {
    const actor = userEvent.setup();
    let answer: (value: unknown) => void = () => {};
    api.setLike.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    render();

    await actor.click(await screen.findByRole("button", { name: "Like" }));
    expect(screen.getByRole("button", { name: "Unlike" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3 likes" })).toBeTruthy();
    expect(api.setLike).toHaveBeenCalledWith("post-1", true);

    answer({ ok: true, value: { likeCount: 5, viewerHasLiked: true } });
    expect(await screen.findByRole("button", { name: "5 likes" })).toBeTruthy();
  });

  it("puts the like back when the server refuses", async () => {
    const actor = userEvent.setup();
    api.setLike.mockResolvedValue({ ok: false, failure: "network" });
    render();

    await actor.click(await screen.findByRole("button", { name: "Like" }));

    expect(await screen.findByText(/couldn't be saved/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Like" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: "2 likes" })).toBeTruthy();
  });

  it("shows who liked the post", async () => {
    const actor = userEvent.setup();
    api.likes.mockResolvedValue(page([{ person: { id: "friend-1", username: "ben", displayName: "Ben" }, likedAt: new Date() }]));
    render();

    await actor.click(await screen.findByRole("button", { name: "2 likes" }));

    const likers = await screen.findByRole("region", { name: "Liked by" });
    expect(within(likers).getByRole("link", { name: "Ben" }).getAttribute("href")).toBe("/u/ben");
  });
});

describe("comments", () => {
  it("shows replies under their comment", async () => {
    get.mockResolvedValue({ ok: true, value: detail({ commentCount: 2 }) });
    api.comments.mockResolvedValue(page([
      comment(),
      comment({ id: "comment-2", parentCommentId: "comment-1", author: { id: "author-1", username: "ana_walks", displayName: "Ana" }, text: "Thanks!" }),
    ]));
    render();

    const thread = await screen.findByRole("article", { name: "Comment by Ben" });
    expect(screen.getByRole("heading", { name: "2 comments" })).toBeTruthy();
    const replies = thread.closest("li")!.querySelector("ol")!;
    expect(within(replies).getByText("Thanks!")).toBeTruthy();
  });

  it("posts a comment and keeps its ID for a retry after a failure", async () => {
    const actor = userEvent.setup();
    get.mockResolvedValueOnce({ ok: true, value: detail() }).mockResolvedValue({ ok: true, value: detail({ commentCount: 1 }) });
    api.createComment
      .mockResolvedValueOnce({ ok: false, failure: "network" })
      .mockResolvedValueOnce({ ok: true, value: comment({ id: "comment-9", author: { id: "me", username: "me", displayName: "Me" }, text: "Lovely." }) });
    render();

    await actor.type(await screen.findByPlaceholderText("Add a comment"), "Lovely.");
    await actor.click(screen.getByRole("button", { name: "Post" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/offline/);

    await actor.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Lovely.")).toBeTruthy();
    const [first, second] = api.createComment.mock.calls;
    expect(first![1]).toEqual({ clientCommentId: expect.any(String), text: "Lovely." });
    expect(second![1].clientCommentId).toBe(first![1].clientCommentId);
    expect(await screen.findByRole("heading", { name: "1 comment" })).toBeTruthy();
    expect((screen.getByPlaceholderText("Add a comment") as HTMLTextAreaElement).value).toBe("");
  });

  it("doesn't add a new comment ahead of older ones that haven't loaded", async () => {
    const actor = userEvent.setup();
    api.comments.mockResolvedValue({ ok: true, value: { items: [comment()], nextCursor: "next", hasMore: true } });
    api.createComment.mockResolvedValue({ ok: true, value: comment({ id: "comment-9", text: "Lovely." }) });
    render();

    await actor.type(await screen.findByPlaceholderText("Add a comment"), "Lovely.");
    await actor.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText(/at the end, after the comments that haven't loaded yet/)).toBeTruthy();
    expect(screen.queryByText("Lovely.")).toBeNull();
  });

  it("replies to a comment", async () => {
    const actor = userEvent.setup();
    api.comments.mockResolvedValue(page([comment()]));
    api.createComment.mockResolvedValue({ ok: true, value: comment({ id: "comment-2", parentCommentId: "comment-1", text: "Agreed." }) });
    render();

    await actor.click(await screen.findByRole("button", { name: "Reply" }));
    await actor.type(screen.getByPlaceholderText("Reply to Ben"), "Agreed.");
    await actor.click(screen.getByRole("button", { name: "Post reply" }));

    await waitFor(() => expect(api.createComment).toHaveBeenCalledWith("post-1", expect.objectContaining({ parentCommentId: "comment-1", text: "Agreed." })));
    expect(await screen.findByText("Agreed.")).toBeTruthy();
  });

  it("edits your own comment", async () => {
    const actor = userEvent.setup();
    api.comments.mockResolvedValue(page([comment({ viewerCanEdit: true, viewerCanDelete: true })]));
    api.updateComment.mockResolvedValue({ ok: true, value: comment({ text: "Stunning.", editedAt: new Date(), viewerCanEdit: true, viewerCanDelete: true }) });
    render();

    await actor.click(await screen.findByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Edit your comment");
    await actor.clear(box);
    await actor.type(box, "Stunning.");
    await actor.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Stunning.")).toBeTruthy();
    expect(screen.getByText(/edited/)).toBeTruthy();
    expect(api.updateComment).toHaveBeenCalledWith("post-1", "comment-1", "Stunning.");
  });

  it("lets the post's author delete a comment and its replies after confirming", async () => {
    const actor = userEvent.setup();
    get.mockResolvedValueOnce({ ok: true, value: detail({ viewerIsAuthor: true, commentCount: 5 }) })
      .mockResolvedValue({ ok: true, value: detail({ viewerIsAuthor: true, commentCount: 0 }) });
    api.comments.mockResolvedValue(page([
      comment({ viewerCanDelete: true }),
      comment({ id: "comment-2", parentCommentId: "comment-1", author: { id: "friend-2", username: "cy", displayName: "Cy" }, text: "Me too." }),
    ]));
    api.deleteComment.mockResolvedValue({ ok: true, value: undefined });
    render();

    const thread = await screen.findByRole("article", { name: "Comment by Ben" });
    expect(within(thread).queryByRole("button", { name: "Edit" })).toBeNull();
    await actor.click(within(thread).getAllByRole("button", { name: "Delete" })[0]!);
    expect(within(thread).getByText("Delete this comment and its replies?")).toBeTruthy();
    await actor.click(within(thread).getByRole("button", { name: "Yes, delete" }));

    await waitFor(() => expect(screen.queryByText("Beautiful.")).toBeNull());
    expect(screen.queryByText("Me too.")).toBeNull();
    // The server's count, which also covers replies on pages not loaded yet.
    expect(await screen.findByRole("heading", { name: "0 comments" })).toBeTruthy();
    expect(api.deleteComment).toHaveBeenCalledWith("post-1", "comment-1");
  });

  it("hides edit and delete on someone else's comment", async () => {
    api.comments.mockResolvedValue(page([comment()]));
    render();

    const thread = await screen.findByRole("article", { name: "Comment by Ben" });
    expect(within(thread).queryByRole("button", { name: "Edit" })).toBeNull();
    expect(within(thread).queryByRole("button", { name: "Delete" })).toBeNull();
  });
});

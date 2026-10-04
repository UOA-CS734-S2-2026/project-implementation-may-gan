import { act, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostDetailView } from "@/features/posts/get-post/PostDetailView";
import { interactionsApi } from "@/features/interactions/shared/interactions.api";
import { postsApi } from "@/features/posts/shared/posts.api";

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "me" }, session: { id: "me" }, isPending: false }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/u/ana_walks/post-1",
  useSearchParams: () => new URLSearchParams(""),
}));
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
  return {
    client,
    ...rtlRender(
      <QueryClientProvider client={client}>
        <PostDetailView username="ana_walks" postId="post-1" />
      </QueryClientProvider>,
    ),
  };
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

  it("drops the likers already loaded when a refetch says access is gone", async () => {
    const actor = userEvent.setup();
    api.likes.mockResolvedValue(page([{ person: { id: "friend-1", username: "ben", displayName: "Ben" }, likedAt: new Date() }]));
    const { client } = render();
    await actor.click(await screen.findByRole("button", { name: "2 likes" }));
    await screen.findByRole("link", { name: "Ben" });

    api.likes.mockResolvedValue({ ok: false, failure: "notFound" });
    await act(() => client.refetchQueries({ queryKey: ["posts", "me", "likes", "post-1"] }));

    expect(await screen.findByText("Likes aren't available.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Ben" })).toBeNull();
    expect(JSON.stringify(client.getQueryData(["posts", "me", "likes", "post-1"]))).not.toContain("Ben");
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

  it("takes only the comment count after a comment, so a pending like isn't undone", async () => {
    const actor = userEvent.setup();
    let saveLike: (value: unknown) => void = () => {};
    let readCount: (value: unknown) => void = () => {};
    api.setLike.mockReturnValue(new Promise((resolve) => { saveLike = resolve; }));
    api.createComment.mockResolvedValue({ ok: true, value: comment({ id: "comment-9", author: { id: "me", username: "me", displayName: "Me" }, text: "Lovely." }) });
    render();

    await actor.click(await screen.findByRole("button", { name: "Like" }));
    // The count is read before the like is saved, so it still says not liked.
    get.mockReturnValueOnce(new Promise((resolve) => { readCount = resolve; }));
    await actor.type(screen.getByPlaceholderText("Add a comment"), "Lovely.");
    await actor.click(screen.getByRole("button", { name: "Post" }));
    await screen.findByText("Lovely.");

    await act(async () => saveLike({ ok: true, value: { likeCount: 3, viewerHasLiked: true } }));
    await act(async () => readCount({ ok: true, value: detail({ likeCount: 2, viewerHasLiked: false, commentCount: 4 }) }));

    expect(await screen.findByRole("heading", { name: "4 comments" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlike" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3 likes" })).toBeTruthy();
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

  it("shows a new comment after older ones that haven't loaded, then once in order", async () => {
    const actor = userEvent.setup();
    const posted = comment({ id: "comment-9", text: "Lovely." });
    api.comments
      .mockResolvedValueOnce({ ok: true, value: { items: [comment()], nextCursor: "next", hasMore: true } })
      .mockResolvedValueOnce(page([comment({ id: "comment-5", text: "Older." }), posted]));
    api.createComment.mockResolvedValue({ ok: true, value: posted });
    render();

    await actor.type(await screen.findByPlaceholderText("Add a comment"), "Lovely.");
    await actor.click(screen.getByRole("button", { name: "Post" }));

    expect(await screen.findByText(/at the end, after the comments that haven't loaded yet/)).toBeTruthy();
    const more = screen.getByRole("button", { name: "Show more comments" });
    expect(more.compareDocumentPosition(screen.getByText("Lovely.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await actor.click(more);

    await screen.findByText("Older.");
    expect(screen.getAllByText("Lovely.")).toHaveLength(1);
    expect(screen.getByText("Older.").compareDocumentPosition(screen.getByText("Lovely.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows a reply under its comment while older pages haven't loaded", async () => {
    const actor = userEvent.setup();
    const cy = { id: "friend-2", username: "cy", displayName: "Cy" };
    const reply = comment({ id: "comment-9", parentCommentId: "comment-1", author: cy, text: "Agreed." });
    api.comments
      .mockResolvedValueOnce({ ok: true, value: { items: [comment()], nextCursor: "next", hasMore: true } })
      .mockResolvedValueOnce(page([comment({ id: "comment-5", parentCommentId: "comment-1", author: cy, text: "Older reply." }), reply]));
    api.createComment.mockResolvedValue({ ok: true, value: reply });
    render();

    await actor.click(await screen.findByRole("button", { name: "Reply" }));
    await actor.type(screen.getByPlaceholderText("Reply to Ben"), "Agreed.");
    await actor.click(screen.getByRole("button", { name: "Post reply" }));

    const thread = (await screen.findByRole("article", { name: "Comment by Ben" })).closest("li")!;
    expect(await within(thread).findByText("Agreed.")).toBeTruthy();

    await actor.click(screen.getByRole("button", { name: "Show more comments" }));

    const older = await within(thread).findByText("Older reply.");
    expect(within(thread).getAllByText("Agreed.")).toHaveLength(1);
    expect(older.compareDocumentPosition(within(thread).getByText("Agreed.")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

  it("starts a second edit from the saved text", async () => {
    const actor = userEvent.setup();
    const mine = { viewerCanEdit: true, viewerCanDelete: true };
    api.comments.mockResolvedValue(page([comment(mine)]));
    api.updateComment.mockResolvedValue({ ok: true, value: comment({ ...mine, text: "Stunning.", editedAt: new Date() }) });
    render();

    await actor.click(await screen.findByRole("button", { name: "Edit" }));
    await actor.clear(screen.getByLabelText("Edit your comment"));
    await actor.type(screen.getByLabelText("Edit your comment"), "  Stunning.  ");
    await actor.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Stunning.");

    await actor.click(screen.getByRole("button", { name: "Edit" }));

    expect((screen.getByLabelText("Edit your comment") as HTMLTextAreaElement).value).toBe("Stunning.");
  });

  it("won't save an edit over the length limit and says why", async () => {
    const actor = userEvent.setup();
    api.comments.mockResolvedValue(page([comment({ viewerCanEdit: true })]));
    render();

    await actor.click(await screen.findByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Edit your comment");
    await actor.clear(box);
    await actor.click(box);
    await actor.paste("a".repeat(1001));

    expect(screen.getByText("Keep it to 1000 characters.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
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

  it("drops loaded and just-posted comments and the composer when a refetch says access is gone", async () => {
    const actor = userEvent.setup();
    api.comments.mockResolvedValue(page([comment()]));
    api.createComment.mockResolvedValue({ ok: true, value: comment({ id: "comment-2", text: "Mine." , viewerCanEdit: true, viewerCanDelete: true }) });
    const { client } = render();
    await screen.findByRole("article", { name: "Comment by Ben" });
    await actor.type(screen.getByRole("textbox", { name: "Add a comment" }), "Mine.");
    await actor.click(screen.getByRole("button", { name: "Post" }));
    await screen.findByText("Mine.");

    api.comments.mockResolvedValue({ ok: false, failure: "notFound" });
    await act(() => client.refetchQueries({ queryKey: ["posts", "me", "comments", "post-1"] }));

    expect(await screen.findByText("Comments aren't available.")).toBeTruthy();
    expect(screen.queryByText("Beautiful.")).toBeNull();
    expect(screen.queryByText("Mine.")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Add a comment" })).toBeNull();
    expect(client.getQueryData(["interactions", "me", "created-comments", "post-1"])).toEqual([]);
  });
});

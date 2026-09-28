import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let sessionUser: { id: string } | null = { id: "alice" };
const api: Record<string, ReturnType<typeof vi.fn>> = {
  loadFriends: vi.fn(), loadRequests: vi.fn(), searchFriends: vi.fn(),
  sendFriendRequest: vi.fn(), acceptFriendRequest: vi.fn(), declineFriendRequest: vi.fn(), cancelFriendRequest: vi.fn(), removeFriend: vi.fn(),
};

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: sessionUser, session: null, isPending: false }) }));
vi.mock("@/lib/api/friends", () => api);

const { default: FriendsPage } = await import("./page");

type TestPage = { ok: true; value: { items: Array<{ id: string; [key: string]: unknown }>; hasMore: boolean; nextCursor: string | null } };
const page = <T extends { id: string }>(items: T[], hasMore = false, nextCursor: string | null = null): TestPage => ({ ok: true, value: { items, hasMore, nextCursor } });
const card = (id: string, displayName = id) => ({ id, username: id, displayName, relationship: "none" as const });
const emptyRequests = page([] as Array<{ id: string; senderId: string; recipientId: string }>);

function queueInitial(friends: TestPage = page([])) {
  api.loadFriends.mockResolvedValueOnce(friends);
  api.loadRequests.mockResolvedValueOnce(emptyRequests).mockResolvedValueOnce(emptyRequests);
}

describe("friends page", () => {
  beforeEach(() => {
    sessionUser = { id: "alice" };
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  it("does not render old account cards while deferred account requests finish", async () => {
    let resolveOldFriends!: (value: TestPage) => void;
    const oldFriends = new Promise<TestPage>((resolve) => { resolveOldFriends = resolve; });
    api.loadFriends.mockReturnValueOnce(oldFriends);
    api.loadRequests.mockResolvedValueOnce(emptyRequests).mockResolvedValueOnce(emptyRequests);
    const view = render(<FriendsPage />);
    await waitFor(() => expect(api.loadFriends).toHaveBeenCalledTimes(1));

    sessionUser = { id: "bob" };
    queueInitial(page([card("bob", "Bob")]))
    view.rerender(<FriendsPage />);
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
    expect(screen.queryByText("Alice private")).not.toBeInTheDocument();

    await act(async () => { resolveOldFriends(page([card("alice", "Alice private")])); });
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.queryByText("Alice private")).not.toBeInTheDocument();
  });

  it("renders bounded continuation controls and appends de-duplicated pages", async () => {
    queueInitial(page(Array.from({ length: 20 }, (_, index) => card(`friend-${index}`)), true, "friends-2"));
    render(<FriendsPage />);
    await waitFor(() => expect(screen.getByText("friend-19")).toBeInTheDocument());

    api.loadFriends.mockResolvedValueOnce(page([card("friend-19"), card("friend-20")]))
    const loadMore = screen.getByRole("button", { name: "load more" });
    fireEvent.click(loadMore);
    await waitFor(() => expect(screen.getByText("friend-20")).toBeInTheDocument());
    expect(screen.getAllByText("friend-19")).toHaveLength(1);
    expect(api.loadFriends).toHaveBeenLastCalledWith("friends-2");
  });

  it("reaches bounded request and search continuations", async () => {
    api.loadFriends.mockResolvedValueOnce(page([]));
    api.loadRequests
      .mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, index) => ({ id: `in-${index}`, senderId: `in-${index}`, recipientId: "alice", user: card(`in-${index}`) })), true, "incoming-2"))
      .mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, index) => ({ id: `out-${index}`, senderId: "alice", recipientId: `out-${index}`, user: card(`out-${index}`) })), true, "outgoing-2"));
    render(<FriendsPage />);
    await waitFor(() => expect(screen.getByText("in-19")).toBeInTheDocument());
    api.loadRequests.mockResolvedValueOnce(page([{ id: "in-20", senderId: "in-20", recipientId: "alice", user: card("in-20") }]));
    fireEvent.click(screen.getAllByRole("button", { name: "load more" })[0]!);
    await waitFor(() => expect(screen.getByText("in-20")).toBeInTheDocument());
    expect(api.loadRequests).toHaveBeenLastCalledWith("incoming", "incoming-2");

    api.searchFriends.mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, index) => card(`search-${index}`)), true, "search-2"));
    fireEvent.change(screen.getByLabelText("find someone"), { target: { value: "se" } });
    await waitFor(() => expect(screen.getByText("search-19")).toBeInTheDocument());
    api.searchFriends.mockResolvedValueOnce(page([card("search-20")]));
    fireEvent.click(screen.getAllByRole("button", { name: "load more" })[0]!);
    await waitFor(() => expect(screen.getByText("search-20")).toBeInTheDocument());
    expect(api.searchFriends).toHaveBeenLastCalledWith("se", "search-2");
  });

  it("ignores a late mutation failure after a session switch", async () => {
    queueInitial();
    api.searchFriends.mockResolvedValueOnce(page([card("alice-result", "Alice result")]));
    let resolveMutation!: (value: { ok: false; failure: "unavailable" }) => void;
    const pendingMutation = new Promise<{ ok: false; failure: "unavailable" }>((resolve) => { resolveMutation = resolve; });
    api.sendFriendRequest.mockReturnValueOnce(pendingMutation);
    const view = render(<FriendsPage />);
    await waitFor(() => expect(api.loadFriends).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("find someone"), { target: { value: "al" } });
    await waitFor(() => expect(screen.getByText("Alice result")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "add friend" }));

    sessionUser = { id: "bob" };
    queueInitial(page([card("bob", "Bob")]));
    view.rerender(<FriendsPage />);
    await waitFor(() => expect(screen.getByText("Bob")).toBeInTheDocument());
    await act(async () => { resolveMutation({ ok: false, failure: "unavailable" }); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Alice result")).not.toBeInTheDocument();
  });
});

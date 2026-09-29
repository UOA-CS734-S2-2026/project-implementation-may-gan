import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let sessionUser: { id: string } | null = { id: "alice" };
const api: Record<string, ReturnType<typeof vi.fn>> = {
  loadFriends: vi.fn(), loadRequests: vi.fn(),
  acceptFriendRequest: vi.fn(), declineFriendRequest: vi.fn(), cancelFriendRequest: vi.fn(),
};

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: sessionUser, session: null, isPending: false }) }));
vi.mock("@/lib/api/friends", () => api);

const { default: FriendsPage } = await import("./page");

type TestPage = { ok: true; value: { items: Array<{ id: string; [key: string]: unknown }>; hasMore: boolean; nextCursor: string | null } };
const page = <T extends { id: string }>(items: T[], hasMore = false, nextCursor: string | null = null): TestPage => ({ ok: true, value: { items, hasMore, nextCursor } });
const card = (id: string, displayName = id) => ({ id, username: id, displayName, relationship: "friends" as const });
const emptyRequests = page([] as Array<{ id: string; senderId: string; recipientId: string }>);

function setup(friends: TestPage = page([]), incoming: TestPage = emptyRequests, outgoing: TestPage = emptyRequests) {
  api.loadFriends.mockResolvedValue(friends);
  api.loadRequests.mockImplementation(async (direction: string) => direction === "incoming" ? incoming : outgoing);
  api.acceptFriendRequest.mockResolvedValue({ ok: true, value: {} });
  api.declineFriendRequest.mockResolvedValue({ ok: true, value: {} });
  api.cancelFriendRequest.mockResolvedValue({ ok: true, value: {} });
}

describe("friends page", () => {
  beforeEach(() => {
    sessionUser = { id: "alice" };
    Object.values(api).forEach((mock) => mock.mockReset());
  });

  it("finishes loading when Strict Mode replays the mount effect", async () => {
    setup(page([card("friend", "Friend Name")]));
    render(<StrictMode><FriendsPage /></StrictMode>);
    expect(await screen.findByText("Friend Name")).toBeInTheDocument();
    expect(screen.queryByText("Loading your circle...")).not.toBeInTheDocument();
  });

  it("uses equally sized tabs and filters the already loaded friend list locally", async () => {
    const actor = userEvent.setup();
    setup(page([card("ada", "Ada Lovelace"), card("grace", "Grace Hopper")]));
    render(<FriendsPage />);
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    await actor.type(screen.getByRole("textbox", { name: "Search friends" }), "grace");
    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Friends" })).toHaveClass("flex-1");
    expect(api.loadFriends).toHaveBeenCalledTimes(1);
  });

  it("links each friend to their profile and the friend-only message draft", async () => {
    setup(page([card("ada", "Ada Lovelace")]));
    render(<FriendsPage />);
    expect(await screen.findByRole("link", { name: /Ada Lovelace/ })).toHaveAttribute("href", "/ada");
    expect(screen.getByRole("link", { name: "Message" })).toHaveAttribute("href", "/messages/new/ada");
    expect(screen.getAllByText("friends")).toHaveLength(2);
  });

  it("shows received and sent requests with their applicable actions", async () => {
    const actor = userEvent.setup();
    setup(page([]), page([{ id: "in-1", senderId: "ada", recipientId: "alice", user: card("ada", "Ada") }]), page([{ id: "out-1", senderId: "alice", recipientId: "grace", user: card("grace", "Grace") }]));
    render(<FriendsPage />);
    await screen.findByText("No friends yet");
    await actor.click(screen.getByRole("tab", { name: /Requests\s*1/ }));
    expect(await screen.findByText("Received")).toBeInTheDocument();
    await actor.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(api.acceptFriendRequest).toHaveBeenCalledWith("in-1"));
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("appends a bounded friend page without duplicates", async () => {
    setup(page([card("friend-19")], true, "friends-2"));
    render(<FriendsPage />);
    expect(await screen.findByText("friend-19")).toBeInTheDocument();
    api.loadFriends.mockResolvedValueOnce(page([card("friend-19"), card("friend-20")]));
    fireEvent.click(screen.getByRole("button", { name: "load more" }));
    expect(await screen.findByText("friend-20")).toBeInTheDocument();
    expect(screen.getAllByText("friend-19")).toHaveLength(1);
    expect(api.loadFriends).toHaveBeenLastCalledWith("friends-2");
  });

  it("does not render cards from a prior account after an account switch", async () => {
    let resolveOldFriends!: (value: TestPage) => void;
    api.loadFriends.mockReturnValueOnce(new Promise<TestPage>((resolve) => { resolveOldFriends = resolve; }));
    api.loadRequests.mockResolvedValue(emptyRequests);
    const view = render(<FriendsPage />);
    await waitFor(() => expect(api.loadFriends).toHaveBeenCalledTimes(1));
    sessionUser = { id: "bob" };
    setup(page([card("bob", "Bob")]));
    view.rerender(<FriendsPage />);
    expect(await screen.findByText("Bob")).toBeInTheDocument();
    await act(async () => { resolveOldFriends(page([card("alice", "Alice private")])); });
    expect(screen.queryByText("Alice private")).toBeNull();
  });
});

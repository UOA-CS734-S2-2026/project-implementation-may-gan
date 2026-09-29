import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NewConversationPickerPage from "../../app/(main)/messages/new/page";

const loadFriends = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "actor" } }) }));
vi.mock("@/lib/api/friends", () => ({ loadFriends }));

describe("new conversation picker", () => {
  it("reports a failed friends load and retries without claiming the list is empty", async () => {
    loadFriends.mockReset().mockResolvedValueOnce({ ok: false, failure: "network" }).mockResolvedValueOnce({ ok: true, value: { items: [{ id: "bob", username: "bob", displayName: "Bob", relationship: "friends" }], hasMore: false, nextCursor: null } });
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><NewConversationPickerPage /></QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load friends.");
    expect(screen.queryByText("Add a friend to start a conversation here.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: /Bob/ })).toHaveAttribute("href", "/messages/new/bob");
    expect(loadFriends).toHaveBeenCalledTimes(2);
  });
});

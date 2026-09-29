import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { NavSearch } from "./NavSearch";

const push = vi.fn();
const searchFriends = vi.fn(async (_query: string): Promise<any> => ({ ok: true, value: { items: [], nextCursor: null, hasMore: false } }));
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "actor" } }) }));
vi.mock("@/lib/api/friends", () => ({ searchFriends: (query: string) => searchFriends(query) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("NavSearch", () => {
  it("keeps ArrowUp and Enter safe when the result list is empty", async () => {
    vi.useFakeTimers();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NavSearch /></QueryClientProvider>);
    const input = screen.getByRole("textbox", { name: "search users" });
    fireEvent.change(input, { target: { value: "no" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("opens the selected search result by username", async () => {
    searchFriends.mockResolvedValue({ ok: true, value: { items: [{ id: "ada", username: "ada-lovelace", displayName: "Ada Lovelace", relationship: "none" }], nextCursor: null, hasMore: false } });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NavSearch /></QueryClientProvider>);
    const input = screen.getByRole("textbox", { name: "search users" });
    fireEvent.change(input, { target: { value: "ad" } });
    await screen.findByRole("option", { name: /Ada Lovelace/i });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/ada-lovelace");
  });
});

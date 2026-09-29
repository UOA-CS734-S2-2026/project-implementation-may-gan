import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { NavSearch } from "./NavSearch";

const push = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "actor" } }) }));
vi.mock("@/lib/api/friends", () => ({ searchFriends: vi.fn(async () => ({ ok: true, value: { items: [], nextCursor: null, hasMore: false } })) }));
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
});

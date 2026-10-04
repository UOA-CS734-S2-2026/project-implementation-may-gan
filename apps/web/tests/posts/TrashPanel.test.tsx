import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrashPanel } from "@/features/posts/trash/TrashPanel";
import { postsApi } from "@/features/posts/shared/posts.api";

vi.mock("@/features/posts/shared/posts.api", async (original) => {
  const actual = await original<typeof import("@/features/posts/shared/posts.api")>();
  return { ...actual, postsApi: { trash: vi.fn(), restore: vi.fn() } };
});

const api = postsApi as unknown as { trash: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn> };
const post = {
  id: "post-1",
  localDate: "2026-10-04",
  trashedAt: new Date("2026-10-04T01:00:00Z"),
  restoreUntil: new Date("2099-10-11T01:00:00Z"),
  purgeDueAt: new Date("2099-10-18T01:00:00Z"),
  generation: 1,
  pendingCleanup: false,
  failureCategory: null,
};

function subject() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><TrashPanel actorId="owner" /></QueryClientProvider>);
}

describe("TrashPanel", () => {
  beforeEach(() => { api.trash.mockReset(); api.restore.mockReset(); });

  it("shows the restore and permanent cleanup deadlines, then removes a restored post", async () => {
    api.trash.mockResolvedValueOnce({ ok: true, value: [post] }).mockResolvedValue({ ok: true, value: [] });
    api.restore.mockResolvedValue({ ok: true, value: undefined });
    subject();
    expect(await screen.findByText("Dayli from 2026-10-04")).toBeInTheDocument();
    expect(screen.getByText(/Restore by/)).toHaveTextContent("Permanent cleanup is due");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith("post-1"));
    expect(await screen.findByText("Trash is empty.")).toBeInTheDocument();
  });

  it("keeps the post visible and explains a replacement conflict", async () => {
    api.trash.mockResolvedValue({ ok: true, value: [post] });
    api.restore.mockResolvedValue({ ok: false, failure: "conflict" });
    subject();
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already has a replacement");
    expect(screen.getByText("Dayli from 2026-10-04")).toBeInTheDocument();
  });
});

import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrashPanel } from "@/features/posts/trash/TrashPanel";
import { postsApi } from "@/features/posts/shared/posts.api";

const { replace, signOut } = vi.hoisted(() => ({
  replace: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut } }));

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function subject({ strict = false }: { strict?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const panel = <QueryClientProvider client={client}><TrashPanel actorId="owner" /></QueryClientProvider>;
  return { ...render(strict ? <StrictMode>{panel}</StrictMode> : panel), client };
}

describe("TrashPanel", () => {
  beforeEach(() => { api.trash.mockReset(); api.restore.mockReset(); replace.mockReset(); signOut.mockClear(); });

  it("shows the restore and permanent cleanup deadlines, then removes a restored post", async () => {
    api.trash.mockResolvedValue({ ok: true, value: [post] });
    api.restore.mockResolvedValue({ ok: true, value: undefined });
    subject({ strict: true });
    expect(await screen.findByText("Dayli from 2026-10-04")).toBeInTheDocument();
    expect(screen.getByText(/Restore by/)).toHaveTextContent("Permanent cleanup is due");
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith("post-1"));
    expect(await screen.findByText("Trash is empty.")).toBeInTheDocument();
  });

  it("shows a newer trash generation returned after restoring the previous generation", async () => {
    api.trash
      .mockResolvedValueOnce({ ok: true, value: [post] })
      .mockResolvedValue({ ok: true, value: [{ ...post, generation: 2 }] });
    api.restore.mockResolvedValue({ ok: true, value: undefined });
    subject();
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(api.trash.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText("Dayli from 2026-10-04")).toBeInTheDocument();
  });

  it("keeps a restored generation hidden when a delayed Trash response returns it", async () => {
    const staleTrash = deferred<{ ok: true; value: Array<typeof post> }>();
    api.trash
      .mockResolvedValueOnce({ ok: true, value: [post] })
      .mockImplementation(() => staleTrash.promise);
    api.restore.mockResolvedValue({ ok: true, value: undefined });
    const { client } = subject();
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    expect(await screen.findByText("Trash is empty.")).toBeInTheDocument();
    await waitFor(() => expect(api.trash.mock.calls.length).toBeGreaterThanOrEqual(2));
    staleTrash.resolve({ ok: true, value: [post] });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByText("Dayli from 2026-10-04")).not.toBeInTheDocument();
    expect(screen.getByText("Trash is empty.")).toBeInTheDocument();
  });

  it("does not let an old actor restore completion suppress the current actor's post", async () => {
    const oldRestore = deferred<{ ok: true; value: undefined }>();
    api.trash
      .mockResolvedValueOnce({ ok: true, value: [post] })
      .mockResolvedValue({ ok: true, value: [{ ...post, localDate: "2026-10-05" }] });
    api.restore.mockImplementation(() => oldRestore.promise);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><TrashPanel actorId="actor-a" /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    view.rerender(<QueryClientProvider client={client}><TrashPanel actorId="actor-b" /></QueryClientProvider>);
    expect(await screen.findByText("Dayli from 2026-10-05")).toBeInTheDocument();
    oldRestore.resolve({ ok: true, value: undefined });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(screen.getByText("Dayli from 2026-10-05")).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("suppresses each restored generation without hiding the next one", async () => {
    let generation = 1;
    api.trash.mockImplementation(async () => ({ ok: true, value: [{ ...post, generation }] }));
    api.restore.mockImplementation(async () => {
      if (generation === 1) generation = 2;
      return { ok: true, value: undefined };
    });
    const { client } = subject();
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Dayli from 2026-10-04")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.getByText("Trash is empty.")).toBeInTheDocument();
  });

  it("keeps the post visible and explains a replacement conflict", async () => {
    api.trash.mockResolvedValue({ ok: true, value: [post] });
    api.restore.mockResolvedValue({ ok: false, failure: "dayOccupied" });
    subject();
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already has a replacement");
    expect(screen.getByText("Dayli from 2026-10-04")).toBeInTheDocument();
  });

  it("disables restore when the deadline passes without another app update", async () => {
    api.trash.mockResolvedValue({ ok: true, value: [{
      ...post,
      restoreUntil: new Date(Date.now() + 100),
      purgeDueAt: new Date(Date.now() + 1_000),
    }] });
    subject();
    expect(await screen.findByRole("button", { name: "Restore" })).toBeEnabled();
    expect(await screen.findByRole("button", { name: "Restore period ended" }, { timeout: 2_000 })).toBeDisabled();
  });

  it("clears private Trash data and redirects when the live session is rejected", async () => {
    api.trash.mockResolvedValue({ ok: true, value: [post] });
    api.restore.mockResolvedValue({ ok: false, failure: "unauthenticated" });
    subject();
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(screen.queryByText("Dayli from 2026-10-04")).not.toBeInTheDocument();
  });
});

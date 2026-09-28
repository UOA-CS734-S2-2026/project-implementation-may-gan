import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInboxQuery } from "@/features/messaging/inbox/use-inbox-query";
import { useMessageHistoryQuery } from "@/features/messaging/message-history/use-message-history-query";
import { useSendMessageMutation } from "@/features/messaging/send-message/use-send-message-mutation";
import { useResolveRequestMutation } from "@/features/messaging/resolve-request/use-resolve-request-mutation";
import { flattenMessagePages } from "@/features/messaging/shared/message-cache";
import { messagingApi } from "@/features/messaging/shared/messaging.api";

let userId = "me";
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: userId }, session: { id: userId }, isPending: false }) }));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: { inbox: vi.fn(), messages: vi.fn(), send: vi.fn(), resolveRequest: vi.fn() } }));
const api = messagingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const page = (items: Array<{ id: string; text?: string }>, nextCursor: string | null = null) => ({ items: items.map((item, index) => ({ id: item.id, conversationId: "c1", sequence: String(index + 1), senderId: "me", clientMessageId: item.id, text: item.text ?? item.id, replyToMessageId: null, replyPreview: null, version: 1, createdAt: new Date().toISOString(), editedAt: null, unsentAt: null, reactions: [] })), nextCursor, hasMore: Boolean(nextCursor) });
function withClient(ui: React.ReactNode) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) }; }
function InboxReader() { const query = useInboxQuery("inbox"); return <output>{query.data?.pages.flatMap((entry) => entry.items).map((entry) => entry.id).join(",") ?? "loading"}</output>; }
function HistoryHarness() { const query = useMessageHistoryQuery("c1"); const send = useSendMessageMutation("c1"); const messages = flattenMessagePages(query.data); return <><output>{messages.map((message) => `${message.id}:${message.delivery ?? "sent"}`).join(",")}</output><button type="button" onClick={() => send.mutate({ clientMessageId: "stable-id", text: "pending" })}>send</button><button type="button" onClick={() => send.mutate({ clientMessageId: "stable-id", text: "pending" })}>retry</button></>; }
function DeferredHistoryHarness() { const query = useMessageHistoryQuery("c1"); const send = useSendMessageMutation("c1"); const messages = flattenMessagePages(query.data); return <><output>{messages.map((message) => `${message.id}:${message.delivery ?? "sent"}`).join(",")}</output><button type="button" onClick={() => send.mutate({ clientMessageId: "first-id", text: "first" })}>first</button><button type="button" onClick={() => send.mutate({ clientMessageId: "second-id", text: "second" })}>second</button><button type="button" onClick={() => send.mutate({ clientMessageId: "first-id", text: "first" })}>retry first</button></>; }
function ResolveHarness() { const inbox = useInboxQuery("inbox"); const resolve = useResolveRequestMutation("c1"); return <><output>{inbox.data?.pages.flatMap((entry) => entry.items).map((entry) => entry.id).join(",") ?? "loading"}</output><button type="button" onClick={() => resolve.mutate("accept")}>accept</button></>; }

beforeEach(() => { vi.clearAllMocks(); userId = "me"; });
describe("messaging TanStack cache", () => {
  it("deduplicates consumers, loads the next cursor, and never polls", async () => {
    api.inbox.mockResolvedValueOnce({ ok: true, value: { items: [{ id: "first" }], nextCursor: "cursor-1", hasMore: true } }).mockResolvedValueOnce({ ok: true, value: { items: [{ id: "older" }], nextCursor: null, hasMore: false } });
    function Readers() { const query = useInboxQuery("inbox"); return <><InboxReader /><InboxReader /><button type="button" onClick={() => void query.fetchNextPage()}>more</button></>; }
    withClient(<Readers />); await screen.findAllByText("first"); expect(api.inbox).toHaveBeenCalledTimes(1);
    await act(async () => { await screen.getByRole("button", { name: "more" }).click(); });
    await waitFor(() => expect(api.inbox).toHaveBeenLastCalledWith("inbox", "cursor-1"));
    await new Promise((resolve) => setTimeout(resolve, 20)); expect(api.inbox).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed optimistic send and retries its exact client ID", async () => {
    api.messages.mockResolvedValue({ ok: true, value: page([{ id: "existing" }]) });
    api.send.mockResolvedValueOnce({ ok: false, failure: "network", message: "offline" }).mockResolvedValueOnce({ ok: true, value: page([{ id: "server" }]).items[0] });
    withClient(<HistoryHarness />); await screen.findByText("existing:sent");
    await act(async () => { await screen.getByRole("button", { name: "send" }).click(); });
    await screen.findByText(/pending:stable-id:failed/); expect(api.send).toHaveBeenCalledWith("c1", "stable-id", "pending", undefined);
    await act(async () => { await screen.getByRole("button", { name: "retry" }).click(); });
    await waitFor(() => expect(api.send).toHaveBeenCalledTimes(2)); expect(api.send.mock.calls[1][1]).toBe("stable-id");
  });

  it("merges a send into a deferred initial history response", async () => {
    let resolveInitial: ((value: unknown) => void) | undefined; let resolveOldSnapshot: ((value: unknown) => void) | undefined;
    api.messages.mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; })).mockImplementationOnce(() => new Promise((resolve) => { resolveOldSnapshot = resolve; }));
    api.send.mockResolvedValue({ ok: true, value: page([{ id: "server-send", text: "sent" }]).items[0] });
    withClient(<DeferredHistoryHarness />); await waitFor(() => expect(api.messages).toHaveBeenCalledTimes(1));
    await act(async () => { await screen.getByRole("button", { name: "first" }).click(); });
    await screen.findByText("server-send:sent"); await waitFor(() => expect(api.messages).toHaveBeenCalledTimes(2));
    await act(async () => { resolveInitial?.({ ok: true, value: page([{ id: "initial", text: "old" }]) }); resolveOldSnapshot?.({ ok: true, value: page([{ id: "initial", text: "old" }]) }); });
    await waitFor(() => expect(screen.getByText("initial:sent,server-send:sent")).toBeTruthy());
  });

  it("keeps concurrent pending intents when one ambiguous send fails and retries the same ID", async () => {
    let resolveInitial: ((value: unknown) => void) | undefined; let resolveOldSnapshot: ((value: unknown) => void) | undefined;
    api.messages.mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; })).mockImplementationOnce(() => new Promise((resolve) => { resolveOldSnapshot = resolve; })).mockResolvedValue({ ok: true, value: page([{ id: "initial" }]) });
    api.send.mockResolvedValueOnce({ ok: false, failure: "network", message: "lost acknowledgement" }).mockResolvedValueOnce({ ok: true, value: page([{ id: "server-second" }]).items[0] }).mockResolvedValueOnce({ ok: true, value: page([{ id: "server-first" }]).items[0] });
    withClient(<DeferredHistoryHarness />); await waitFor(() => expect(api.messages).toHaveBeenCalledTimes(1));
    await act(async () => { await screen.getByRole("button", { name: "first" }).click(); await screen.getByRole("button", { name: "second" }).click(); });
    await screen.findByText("initial:sent,server-second:sent,pending:first-id:failed"); await waitFor(() => expect(api.messages.mock.calls.length).toBeGreaterThanOrEqual(2));
    await act(async () => { resolveInitial?.({ ok: true, value: page([{ id: "initial" }]) }); resolveOldSnapshot?.({ ok: true, value: page([{ id: "initial" }]) }); });
    await waitFor(() => expect(screen.getByText("initial:sent,server-second:sent,pending:first-id:failed")).toBeTruthy());
    await act(async () => { await screen.getByRole("button", { name: "retry first" }).click(); });
    await waitFor(() => expect(api.send).toHaveBeenCalledTimes(3)); expect(api.send.mock.calls[2][1]).toBe("first-id");
    await waitFor(() => expect(screen.getByText("initial:sent,server-first:sent,server-second:sent")).toBeTruthy());
  });

  it("refetches a mounted active inbox after accepting a request", async () => {
    api.inbox.mockResolvedValueOnce({ ok: true, value: { items: [{ id: "before-accept" }], nextCursor: null, hasMore: false } }).mockResolvedValueOnce({ ok: true, value: { items: [{ id: "accepted-thread" }], nextCursor: null, hasMore: false } });
    api.resolveRequest.mockResolvedValue({ ok: true, value: { id: "c1", requestState: "active" } });
    withClient(<ResolveHarness />); await screen.findByText("before-accept");
    await act(async () => { await screen.getByRole("button", { name: "accept" }).click(); });
    await screen.findByText("accepted-thread"); expect(api.inbox).toHaveBeenCalledTimes(2);
  });

  it("does not render a late first-account response after the user key changes", async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    api.inbox.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce({ ok: true, value: { items: [{ id: "new-account" }], nextCursor: null, hasMore: false } });
    const view = withClient(<InboxReader />); await waitFor(() => expect(api.inbox).toHaveBeenCalledTimes(1)); userId = "other"; view.rerender(<QueryClientProvider client={view.client}><InboxReader /></QueryClientProvider>);
    await screen.findByText("new-account"); await act(async () => { resolveOld?.({ ok: true, value: { items: [{ id: "old-account" }], nextCursor: null, hasMore: false } }); });
    expect(screen.queryByText("old-account")).toBeNull();
  });
});

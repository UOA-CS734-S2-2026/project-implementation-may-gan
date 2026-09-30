import { fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Conversation } from "@/features/messaging/conversation/Conversation";
import { messagingApi } from "@/features/messaging/shared/messaging.api";

let userId = "me";
const push = vi.fn();
let changes: Array<{ changeSequence: string; kind: string; messageId: string; memberId: string | null }> = [];
const live = { revision: 0, unread: { inboxCount: 2, requestCount: 1 }, changesFor: () => changes, refreshUnread: vi.fn() };

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: userId }, session: { id: userId }, isPending: false }) }));
vi.mock("@/features/messaging/realtime/MessagingProvider", () => ({ useMessagingLive: () => live }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: {
  conversation: vi.fn(), messages: vi.fn(), message: vi.fn(), send: vi.fn(), edit: vi.fn(), unsend: vi.fn(), react: vi.fn(), removeReaction: vi.fn(), markRead: vi.fn(), resolveRequest: vi.fn(), unread: vi.fn(), inbox: vi.fn(), direct: vi.fn(),
} }));

const api = messagingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
function render(ui: Parameters<typeof rtlRender>[0]) { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); const view = rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>); return { ...view, rerender: (next: Parameters<typeof rtlRender>[0]) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) }; }
const message = (overrides = {}) => ({ id: "m1", conversationId: "c1", sequence: "3", senderId: "me", clientMessageId: "original-id", text: "hello", replyToMessageId: null, replyPreview: null, version: 1, createdAt: new Date().toISOString(), editedAt: null, unsentAt: null, reactions: [], ...overrides });
const conversation = (overrides = {}) => ({ id: "c1", peer: { id: "them", name: "Ada" }, requestState: "active", latestMessage: message(), unreadCount: 1, lastMessageSequence: "3", lastChangeSequence: "3", lastReadSequence: "0", receiptSequence: "0", capabilities: { canSend: true, canResolveRequest: false }, updatedAt: new Date().toISOString(), ...overrides });

beforeEach(() => {
  vi.clearAllMocks(); userId = "me"; changes = []; live.revision = 0;
  api.conversation.mockResolvedValue({ ok: true, value: conversation() });
  api.messages.mockResolvedValue({ ok: true, value: { items: [message(), message({ id: "m0", sequence: "2", senderId: "them", text: "parent" })], nextCursor: "1", hasMore: true } });
  api.message.mockResolvedValue({ ok: true, value: message() });
  api.send.mockResolvedValue({ ok: true, value: message({ id: "m2", sequence: "4", clientMessageId: "new-id", text: "new" }) });
  api.edit.mockResolvedValue({ ok: true, value: message({ text: "changed", version: 2, editedAt: new Date().toISOString() }) });
  api.unsend.mockResolvedValue({ ok: true, value: message({ text: null, unsentAt: new Date().toISOString(), version: 2 }) });
  api.react.mockResolvedValue({ ok: true, value: message({ reactions: [{ reaction: "like", count: 1, reactedByActor: true }] }) });
  api.removeReaction.mockResolvedValue({ ok: true, value: message() });
  api.markRead.mockResolvedValue({ ok: true, value: { lastReadSequence: "2", receiptSequence: "2", unreadCount: 0 } });
  api.resolveRequest.mockResolvedValue({ ok: true, value: conversation() });
  api.inbox.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null, hasMore: false } });
  api.direct.mockResolvedValue({ ok: true, value: { conversation: conversation(), message: message() } });
});

describe("messaging screens", () => {
  it("sends a reply, retains older history, edits, reacts, and unsends sender messages", async () => {
    const actor = userEvent.setup(); render(<Conversation conversationId="c1" />);
    await screen.findByText("hello");
    await actor.click(screen.getByRole("button", { name: "load older messages" }));
    expect(api.messages).toHaveBeenLastCalledWith("c1", "1");
    const reply = screen.getAllByRole("button", { name: "reply" })[0];
    await actor.click(reply); await actor.type(screen.getByLabelText("Message"), "answer"); await actor.click(screen.getByRole("button", { name: "send" }));
    await waitFor(() => expect(api.send).toHaveBeenCalledWith("c1", expect.any(String), "answer", "m0"));
    await actor.click(within(screen.getByTestId("message-m1")).getByRole("button", { name: "edit" }));
    await actor.clear(screen.getByLabelText("Message")); await actor.type(screen.getByLabelText("Message"), "changed"); await actor.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith("c1", "m1", "changed", 1));
    const bubble = within(screen.getByTestId("message-m1"));
    const addReaction = bubble.getByLabelText("Add reaction");
    await actor.click(addReaction);
    expect(addReaction).toHaveAttribute("aria-expanded", "true");
    await actor.click(bubble.getByRole("button", { name: "React Like" }));
    await waitFor(() => expect(api.react).toHaveBeenCalledWith("c1", "m1", "like"));
    expect(addReaction).toHaveAttribute("aria-expanded", "false");
    await actor.click(within(screen.getByTestId("message-m1")).getByRole("button", { name: "unsend" }));
    await waitFor(() => expect(api.unsend).toHaveBeenCalledWith("c1", "m1"));
    expect(await screen.findByText("This message was unsent.")).toBeTruthy();
  });

  it("sends on Enter, preserves Shift+Enter, and does not submit IME composition", async () => {
    const actor = userEvent.setup();
    render(<Conversation conversationId="c1" />);
    await screen.findByText("hello");
    const composer = screen.getByLabelText("Message");
    await actor.type(composer, "first");
    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(api.send).toHaveBeenCalledWith("c1", expect.any(String), "first", undefined));
    await actor.type(composer, "second");
    await actor.keyboard("{Shift>}{Enter}{/Shift}");
    expect((composer as HTMLTextAreaElement).value).toBe("second\n");
    expect(api.send).toHaveBeenCalledTimes(1);
    fireEvent.compositionStart(composer);
    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });
    fireEvent.compositionEnd(composer);
    expect(api.send).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed message and retries its exact immutable client ID", async () => {
    const actor = userEvent.setup(); api.send.mockResolvedValueOnce({ ok: false, message: "offline" }).mockResolvedValueOnce({ ok: true, value: message({ id: "m2", sequence: "4", text: "again" }) });
    render(<Conversation conversationId="c1" />); await screen.findByText("hello");
    await actor.type(screen.getByLabelText("Message"), "again"); await actor.click(screen.getByRole("button", { name: "send" }));
    const firstId = api.send.mock.calls[0][1];
    expect(await screen.findByText("not sent")).toBeTruthy(); await actor.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() => expect(api.send).toHaveBeenCalledTimes(2));
    expect(api.send.mock.calls[1][1]).toBe(firstId); expect(api.send.mock.calls[1][2]).toBe("again");
  });

  it("renders request controls and only enables shared actions when allowed", async () => {
    const actor = userEvent.setup(); api.conversation.mockResolvedValue({ ok: true, value: conversation({ requestState: "pending", capabilities: { canSend: false, canResolveRequest: true } }) });
    render(<Conversation conversationId="c1" />); await screen.findByText("Message request. Actions stay private until it is accepted.");
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).disabled).toBe(true);
    await actor.click(screen.getByRole("button", { name: "accept request" }));
    expect(api.resolveRequest).toHaveBeenCalledWith("c1", "accept");
  });

  it("keeps sender unsend available for pending and declined initial requests, but not blocked active threads", async () => {
    const view = render(<Conversation conversationId="c1" />); await screen.findByText("hello");
    expect(within(screen.getByTestId("message-m1")).getByRole("button", { name: "unsend" })).toBeTruthy();

    api.conversation.mockResolvedValue({ ok: true, value: conversation({ requestState: "pending", capabilities: { canSend: false, canResolveRequest: false } }) });
    view.rerender(<Conversation conversationId="pending" />); await screen.findByText("Message request. Actions stay private until it is accepted.");
    expect(within(screen.getByTestId("message-m1")).getByRole("button", { name: "unsend" })).toBeTruthy();

    api.conversation.mockResolvedValue({ ok: true, value: conversation({ requestState: "declined", capabilities: { canSend: false, canResolveRequest: false } }) });
    view.rerender(<Conversation conversationId="declined" />); await waitFor(() => expect(screen.queryByText("Message request. Actions stay private until it is accepted.")).toBeNull());
    await screen.findByTestId("message-m1");
    expect(within(screen.getByTestId("message-m1")).getByRole("button", { name: "unsend" })).toBeTruthy();

    api.conversation.mockResolvedValue({ ok: true, value: conversation({ requestState: "active", capabilities: { canSend: false, canResolveRequest: false } }) });
    view.rerender(<Conversation conversationId="blocked" />); await screen.findByText("New actions are unavailable in this conversation.");
    expect(within(screen.getByTestId("message-m1")).queryByRole("button", { name: "unsend" })).toBeNull();
  });

  it("reconciles parent edits and tombstones into older loaded reply previews", async () => {
    const parent = message({ id: "parent", sequence: "1", senderId: "them", text: "private parent" });
    const child = message({ id: "child", sequence: "2", senderId: "me", text: "reply", replyToMessageId: "parent", replyPreview: { id: "parent", senderId: "them", text: "private parent", unsentAt: null } });
    api.messages.mockResolvedValue({ ok: true, value: { items: [parent, child], nextCursor: "0", hasMore: false } });
    const view = render(<Conversation conversationId="c1" />); await screen.findByText("private parent");

    changes = [{ changeSequence: "4", kind: "message.updated", messageId: "parent", memberId: null }]; live.revision = 1;
    api.message.mockResolvedValueOnce({ ok: true, value: { ...parent, text: "edited parent", editedAt: new Date().toISOString(), version: 2 } });
    view.rerender(<Conversation conversationId="c1" />);
    expect(await screen.findByText("Replying to: edited parent")).toBeTruthy();
    expect(screen.queryByText("private parent")).toBeNull();

    changes = [...changes, { changeSequence: "5", kind: "message.unsent", messageId: "parent", memberId: null }]; live.revision = 2;
    api.message.mockResolvedValueOnce({ ok: true, value: { ...parent, text: null, unsentAt: new Date().toISOString(), version: 3 } });
    view.rerender(<Conversation conversationId="c1" />);
    await waitFor(() => expect(screen.getAllByText("This message was unsent.").length).toBeGreaterThanOrEqual(1));
    expect(screen.queryByText("private parent")).toBeNull();
    expect(screen.queryByText("edited parent")).toBeNull();
  });

  it("preserves the oldest loaded cursor while live reconciliation refreshes the latest page", async () => {
    api.messages.mockImplementation(async (_conversationId: string, beforeSequence?: string) => {
      if (beforeSequence === "3") return { ok: true, value: { items: [message({ id: "m3", sequence: "3" })], nextCursor: "2", hasMore: true } };
      if (beforeSequence === "2") return { ok: true, value: { items: [message({ id: "m2", sequence: "2" })], nextCursor: "1", hasMore: true } };
      return { ok: true, value: { items: [message({ id: "m4", sequence: "4" })], nextCursor: "3", hasMore: true } };
    });
    const view = render(<Conversation conversationId="c1" />); await screen.findByTestId("message-m4");
    await userEvent.setup().click(screen.getByRole("button", { name: "load older messages" }));
    await waitFor(() => expect(api.messages).toHaveBeenLastCalledWith("c1", "3"));
    changes = [{ changeSequence: "4", kind: "message.updated", messageId: "m4", memberId: null }]; live.revision = 1;
    api.message.mockResolvedValueOnce({ ok: true, value: message({ id: "m4", sequence: "4", version: 2, text: "newest edit" }) });
    view.rerender(<Conversation conversationId="c1" />); await waitFor(() => expect(api.message).toHaveBeenCalledWith("c1", "m4"));
    await userEvent.setup().click(screen.getByRole("button", { name: "load older messages" }));
    await waitFor(() => expect(api.messages).toHaveBeenLastCalledWith("c1", "2"));
  });

  it("does not display a late initial response after thread navigation or account switch", async () => {
    let resolveOldConversation: ((value: unknown) => void) | undefined;
    let resolveOldPage: ((value: unknown) => void) | undefined;
    api.conversation.mockImplementation((id: string) => id === "first" ? new Promise((resolve) => { resolveOldConversation = resolve; }) : Promise.resolve({ ok: true, value: conversation({ id, peer: { id: "new-peer", name: userId === "other" ? "Bob" : "Ada" } }) }));
    api.messages.mockImplementation((id: string) => id === "first" ? new Promise((resolve) => { resolveOldPage = resolve; }) : Promise.resolve({ ok: true, value: { items: [message({ id: `new-${userId}`, conversationId: id, text: userId === "other" ? "Bob thread" : "Ada thread" })], nextCursor: null, hasMore: false } }));
    const view = render(<Conversation conversationId="first" />);
    await Promise.resolve();
    view.rerender(<Conversation conversationId="second" />); await screen.findByText("Ada thread");
    userId = "other"; view.rerender(<Conversation conversationId="second" />); await screen.findByText("Bob thread");
    resolveOldConversation?.({ ok: true, value: conversation({ id: "first", peer: { id: "old", name: "Old" } }) });
    resolveOldPage?.({ ok: true, value: { items: [message({ id: "old-message", conversationId: "first", text: "Old private thread" })], nextCursor: null, hasMore: false } });
    await Promise.resolve(); await Promise.resolve();
    expect(screen.queryByText("Old private thread")).toBeNull();
  });

  it("marks visible incoming messages read without a polling loop", async () => {
    class Observer { observe() { this.callback([{ isIntersecting: true }]); } disconnect() {} constructor(private callback: (items: Array<{ isIntersecting: boolean }>) => void) {} }
    vi.stubGlobal("IntersectionObserver", Observer);
    render(<Conversation conversationId="c1" />); await screen.findByText("parent");
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith("c1", "2"));
    vi.unstubAllGlobals();
  });
});

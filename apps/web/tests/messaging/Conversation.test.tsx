import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Conversation } from "@/components/messages/Conversation";
import { messagingApi } from "@/lib/api/messaging";

let userId = "me";
const push = vi.fn();
const live = { revision: 0, unread: { inboxCount: 2, requestCount: 1 }, changesFor: () => [], refreshUnread: vi.fn() };

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: userId }, session: { id: userId }, isPending: false }) }));
vi.mock("@/components/messages/MessagingProvider", () => ({ useMessagingLive: () => live }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/messaging", () => ({ messagingApi: {
  conversation: vi.fn(), messages: vi.fn(), message: vi.fn(), send: vi.fn(), edit: vi.fn(), unsend: vi.fn(), react: vi.fn(), removeReaction: vi.fn(), markRead: vi.fn(), resolveRequest: vi.fn(), unread: vi.fn(), inbox: vi.fn(), direct: vi.fn(),
} }));

const api = messagingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const message = (overrides = {}) => ({ id: "m1", conversationId: "c1", sequence: "3", senderId: "me", clientMessageId: "original-id", text: "hello", replyToMessageId: null, replyPreview: null, version: 1, createdAt: new Date().toISOString(), editedAt: null, unsentAt: null, reactions: [], ...overrides });
const conversation = (overrides = {}) => ({ id: "c1", peer: { id: "them", name: "Ada" }, requestState: "active", latestMessage: message(), unreadCount: 1, lastMessageSequence: "3", lastChangeSequence: "3", lastReadSequence: "0", receiptSequence: "0", capabilities: { canSend: true, canResolveRequest: false }, updatedAt: new Date().toISOString(), ...overrides });

beforeEach(() => {
  vi.clearAllMocks(); userId = "me";
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
    await actor.click(within(screen.getByTestId("message-m1")).getByLabelText("Add reaction"));
    await actor.click(within(screen.getByTestId("message-m1")).getByRole("button", { name: "React Like" }));
    await waitFor(() => expect(api.react).toHaveBeenCalledWith("c1", "m1", "like"));
    await actor.click(within(screen.getByTestId("message-m1")).getByRole("button", { name: "unsend" }));
    await waitFor(() => expect(api.unsend).toHaveBeenCalledWith("c1", "m1"));
    expect(await screen.findByText("This message was unsent.")).toBeTruthy();
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


  it("marks visible incoming messages read without a polling loop", async () => {
    class Observer { observe() { this.callback([{ isIntersecting: true }]); } disconnect() {} constructor(private callback: (items: Array<{ isIntersecting: boolean }>) => void) {} }
    vi.stubGlobal("IntersectionObserver", Observer);
    render(<Conversation conversationId="c1" />); await screen.findByText("parent");
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith("c1", "2"));
    vi.unstubAllGlobals();
  });
});

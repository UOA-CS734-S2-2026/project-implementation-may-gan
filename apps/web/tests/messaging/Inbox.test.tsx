import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Inbox } from "@/features/messaging/inbox/Inbox";
import { formatConversationDate } from "@/features/messaging/inbox/ConversationList";
import { messagingApi, type MessagingConversation } from "@/features/messaging/shared/messaging.api";

let userId = "me";
const refreshUnread = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: userId }, session: { id: userId }, isPending: false }) }));
vi.mock("@/features/messaging/realtime/MessagingProvider", () => ({ useMessagingLive: () => ({ revision: 0, unread: { inboxCount: 2, requestCount: 1 }, changesFor: () => [], refreshUnread }) }));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: { inbox: vi.fn(), resolveRequest: vi.fn() } }));

const api = messagingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
function render(ui: Parameters<typeof rtlRender>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...view, rerender: (next: Parameters<typeof rtlRender>[0]) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}
const conversation = {
  id: "c1",
  peer: { id: "them", name: "Ada" },
  requestState: "active",
  latestMessage: { id: "m1", text: "hello", createdAt: "2026-06-09T12:00:00.000Z" },
  unreadCount: 1,
  updatedAt: "2026-06-08T12:00:00.000Z",
  capabilities: { canSend: true, canResolveRequest: false },
};

beforeEach(() => {
  vi.clearAllMocks();
  userId = "me";
  api.inbox.mockResolvedValue({ ok: true, value: { items: [conversation], nextCursor: null, hasMore: false } });
  api.resolveRequest.mockResolvedValue({ ok: true, value: conversation });
});

describe("Inbox", () => {
  it("renders the WDCC list with a real latest-message date, unread count, and the friend-only composer route", async () => {
    render(<Inbox />);
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    const localDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(conversation.latestMessage.createdAt));
    expect(screen.getByText(localDate)).toBeInTheDocument();
    expect(screen.getByLabelText("1 unread messages")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "new message" })).toHaveAttribute("href", "/messages/new");
  });

  it("uses the viewer's local calendar day for a message near midnight UTC", () => {
    vi.stubEnv("TZ", "Pacific/Auckland");
    try {
      const lateMessage = { ...conversation, latestMessage: { ...conversation.latestMessage, createdAt: "2026-06-09T23:30:00.000Z" } };
      expect(formatConversationDate(lateMessage as unknown as MessagingConversation)).toBe("10/06/2026");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("switches folders and preserves message request actions", async () => {
    const actor = userEvent.setup();
    api.inbox.mockImplementation(async (folder: string) => ({ ok: true, value: { items: folder === "requests" ? [{ ...conversation, id: "request-1", requestState: "pending", capabilities: { canSend: false, canResolveRequest: true } }] : [conversation], nextCursor: null, hasMore: false } }));
    render(<Inbox />);
    await screen.findByText("Ada");
    await actor.click(screen.getByRole("tab", { name: /requests\s*1/i }));
    await waitFor(() => expect(api.inbox).toHaveBeenLastCalledWith("requests"));
    const accept = screen.getByRole("button", { name: "Accept" });
    expect(accept.parentElement).toHaveClass("ml-[52px]");
    expect(screen.getByRole("button", { name: "Decline" }).parentElement).toBe(accept.parentElement);
    await actor.click(accept);
    await waitFor(() => expect(api.resolveRequest).toHaveBeenCalledWith("request-1", "accept"));
    expect(refreshUnread).toHaveBeenCalled();
  });

  it("clears visible rows on account switch", async () => {
    const view = render(<Inbox />);
    await screen.findByText("Ada");
    userId = "other";
    api.inbox.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null, hasMore: false } });
    view.rerender(<Inbox />);
    await waitFor(() => expect(screen.queryByText("Ada")).toBeNull());
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Inbox } from "@/components/messages/Inbox";
import { messagingApi } from "@/lib/api/messaging";

let userId = "me";
const push = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: userId }, session: { id: userId }, isPending: false }) }));
vi.mock("@/components/messages/MessagingProvider", () => ({ useMessagingLive: () => ({ revision: 0, unread: { inboxCount: 2, requestCount: 1 }, changesFor: () => [], refreshUnread: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api/messaging", () => ({ messagingApi: { inbox: vi.fn(), direct: vi.fn() } }));

const api = messagingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
const conversation = { id: "c1", peer: { id: "them", name: "Ada" }, requestState: "active", latestMessage: { text: "hello" }, unreadCount: 1 };

beforeEach(() => {
  vi.clearAllMocks(); userId = "me";
  api.inbox.mockResolvedValue({ ok: true, value: { items: [conversation], nextCursor: null, hasMore: false } });
  api.direct.mockResolvedValue({ ok: true, value: { conversation, message: {} } });
});

describe("Inbox", () => {
  it("loads folders, starts a known-ID conversation, and clears visible rows on account switch", async () => {
    const actor = userEvent.setup(); const view = render(<Inbox />); await screen.findByText("Ada");
    await actor.click(screen.getByRole("tab", { name: /requests 1/i })); await waitFor(() => expect(api.inbox).toHaveBeenLastCalledWith("requests"));
    await actor.type(screen.getByLabelText("Recipient ID"), "known-user"); await actor.type(screen.getByLabelText("First message"), "Hi Ada"); await actor.click(screen.getByRole("button", { name: "start" }));
    await waitFor(() => expect(api.direct).toHaveBeenCalledWith("known-user", expect.any(String), "Hi Ada")); expect(push).toHaveBeenCalledWith("/messages/c1");
    userId = "other"; api.inbox.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null, hasMore: false } }); view.rerender(<Inbox />);
    await waitFor(() => expect(screen.queryByText("Ada")).toBeNull());
  });
});

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingProvider } from "@/features/messaging/realtime/MessagingProvider";
import { useConversationQuery } from "@/features/messaging/conversation/use-conversation-query";
import { useInboxQuery } from "@/features/messaging/inbox/use-inbox-query";
import { useMessageHistoryQuery } from "@/features/messaging/message-history/use-message-history-query";
import { messagingApi } from "@/features/messaging/shared/messaging.api";

const realtimeInputs = vi.hoisted(() => [] as Array<{ onReady(): Promise<void> }>);
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "actor" }, isPending: false }) }));
vi.mock("@/features/messaging/realtime/MessagingRealtime", () => ({
  MessagingRealtime: class {
    constructor(input: { onReady(): Promise<void> }) { realtimeInputs.push(input); }
    async start() {}
    stop() {}
    async resume() {}
  },
}));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: {
  unread: vi.fn(), conversation: vi.fn(), messages: vi.fn(), inbox: vi.fn(), realtimeTicket: vi.fn(), changes: vi.fn(), message: vi.fn(),
} }));

const api = messagingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;
function ActiveMessagingViews() {
  useConversationQuery("c1");
  useMessageHistoryQuery("c1");
  useInboxQuery("inbox");
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  realtimeInputs.length = 0;
  api.unread.mockResolvedValue({ ok: true, value: { inboxCount: 0, requestCount: 0 } });
  api.conversation.mockResolvedValue({ ok: true, value: { id: "c1" } });
  api.messages.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null, hasMore: false } });
  api.inbox.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null, hasMore: false } });
});

describe("MessagingProvider", () => {
  it("refetches mounted messaging projections on every ready frame, including a reconnect", async () => {
    render(<MessagingProvider><ActiveMessagingViews /></MessagingProvider>);
    await waitFor(() => expect(realtimeInputs).toHaveLength(1));
    await waitFor(() => {
      expect(api.conversation).toHaveBeenCalledTimes(1);
      expect(api.messages).toHaveBeenCalledTimes(1);
      expect(api.inbox).toHaveBeenCalledTimes(1);
    });

    await realtimeInputs[0]!.onReady();
    await waitFor(() => {
      expect(api.conversation).toHaveBeenCalledTimes(2);
      expect(api.messages).toHaveBeenCalledTimes(2);
      expect(api.inbox).toHaveBeenCalledTimes(2);
    });

    await realtimeInputs[0]!.onReady();
    await waitFor(() => {
      expect(api.conversation).toHaveBeenCalledTimes(3);
      expect(api.messages).toHaveBeenCalledTimes(3);
      expect(api.inbox).toHaveBeenCalledTimes(3);
    });
  });

  it("reconciles active projections when the page returns to the foreground", async () => {
    render(<MessagingProvider><ActiveMessagingViews /></MessagingProvider>);
    await waitFor(() => expect(realtimeInputs).toHaveLength(1));
    await waitFor(() => expect(api.conversation).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => {
      expect(api.conversation).toHaveBeenCalledTimes(2);
      expect(api.messages).toHaveBeenCalledTimes(2);
      expect(api.inbox).toHaveBeenCalledTimes(2);
    });
  });
});

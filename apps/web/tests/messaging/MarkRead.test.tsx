import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useMarkReadMutation } from "@/features/messaging/mark-read/use-mark-read-mutation";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "me" } }) }));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: { markRead: vi.fn() } }));

const api = messagingApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function ReadButton() {
  const markRead = useMarkReadMutation("c1");
  return <button type="button" onClick={() => markRead.mutate("2")}>mark read</button>;
}

describe("useMarkReadMutation", () => {
  it("refreshes both folders and the global unread badge after a receipt", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData(messagingKeys.conversation("me", "c1"), { lastReadSequence: "0", receiptSequence: "0", unreadCount: 1 });
    client.setQueryData(messagingKeys.inbox("me", "inbox"), { pages: [], pageParams: [] });
    client.setQueryData(messagingKeys.inbox("me", "requests"), { pages: [], pageParams: [] });
    client.setQueryData(messagingKeys.unread("me"), { inboxCount: 1, requestCount: 1 });
    api.markRead.mockResolvedValue({ ok: true, value: { lastReadSequence: "2", receiptSequence: "2", unreadCount: 0 } });

    render(<QueryClientProvider client={client}><ReadButton /></QueryClientProvider>);
    screen.getByRole("button", { name: "mark read" }).click();

    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith("c1", "2"));
    await waitFor(() => {
      expect(client.getQueryState(messagingKeys.inbox("me", "inbox"))?.isInvalidated).toBe(true);
      expect(client.getQueryState(messagingKeys.inbox("me", "requests"))?.isInvalidated).toBe(true);
      expect(client.getQueryState(messagingKeys.unread("me"))?.isInvalidated).toBe(true);
    });
    expect(client.getQueryData(messagingKeys.conversation("me", "c1"))).toMatchObject({ lastReadSequence: "2", receiptSequence: "2", unreadCount: 0 });
  });
});

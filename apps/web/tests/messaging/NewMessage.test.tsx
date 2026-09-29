import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewMessage } from "../../app/(main)/messages/new/[username]/page";

const replace = vi.fn();
const loadSocialProfile = vi.fn();
const findDirect = vi.fn();
const mutateAsync = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "actor" } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/friends", () => ({ loadSocialProfile: (...args: unknown[]) => loadSocialProfile(...args) }));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: { findDirect: (...args: unknown[]) => findDirect(...args) } }));
vi.mock("@/features/messaging/create-conversation/use-create-conversation-mutation", () => ({ useCreateConversationMutation: () => ({ mutateAsync, isPending: false, error: null }) }));

const person = { id: "recipient", username: "ada", displayName: "Ada", relationship: "none" };
function renderDraft() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><NewMessage username="ada" /></QueryClientProvider>); }

beforeEach(() => { vi.clearAllMocks(); loadSocialProfile.mockResolvedValue({ ok: true, value: person }); findDirect.mockResolvedValue({ ok: false, failure: "notFound", message: "missing" }); });

describe("NewMessagePage", () => {
  it("shows an unavailable profile instead of an indefinitely pending lookup", async () => {
    loadSocialProfile.mockResolvedValue({ ok: false, failure: "notFound" });
    renderDraft();
    expect(await screen.findByRole("heading", { name: "This profile is unavailable" })).toBeTruthy();
    expect(screen.queryByText("Preparing your note…")).toBeNull();
  });

  it("opens an existing canonical thread without creating a direct conversation", async () => {
    findDirect.mockResolvedValue({ ok: true, value: { conversationId: "existing" } });
    renderDraft();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/messages/existing"));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("uses a stable create id for a missing thread retry", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ conversation: { id: "new" } });
    renderDraft();
    await screen.findByText("Ada");
    await user.type(screen.getByLabelText("Message"), "Hello");
    await user.click(screen.getByRole("button", { name: "send" }));
    await user.click(screen.getByRole("button", { name: "retry send" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1][0]).toEqual(mutateAsync.mock.calls[0][0]);
    expect(replace).toHaveBeenCalledWith("/messages/new");
  });

  it("does not offer send when pair lookup fails", async () => {
    findDirect.mockResolvedValue({ ok: false, failure: "unavailable", message: "down" });
    renderDraft();
    expect(await screen.findByRole("heading", { name: "Conversation lookup is unavailable" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "send" })).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

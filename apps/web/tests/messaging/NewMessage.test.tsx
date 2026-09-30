import { StrictMode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActorScopedNewMessage, NewMessage } from "../../app/(main)/messages/new/[username]/page";

let actorId = "actor-a";
const replace = vi.fn();
const loadSocialProfile = vi.fn();
const findDirect = vi.fn();
const mutateAsync = vi.fn();
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: actorId } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api/friends", () => ({ loadSocialProfile: (...args: unknown[]) => loadSocialProfile(...args) }));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: { findDirect: (...args: unknown[]) => findDirect(...args) } }));
vi.mock("@/features/messaging/create-conversation/use-create-conversation-mutation", () => ({ useCreateConversationMutation: () => ({ mutateAsync, isPending: false, error: null }) }));

const person = { id: "recipient", username: "ada", displayName: "Ada", relationship: "none" };
function renderDraft() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><NewMessage username="ada" /></QueryClientProvider>); }

beforeEach(() => { vi.clearAllMocks(); actorId = "actor-a"; loadSocialProfile.mockResolvedValue({ ok: true, value: person }); findDirect.mockResolvedValue({ ok: false, failure: "notFound", message: "missing" }); mutateAsync.mockResolvedValue({ conversation: { id: "created" } }); });

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

  it("renders an empty normal chat and sends on Enter without treating it as a special first-message form", async () => {
    const user = userEvent.setup();
    renderDraft();
    expect(await screen.findByRole("heading", { name: "Ada" })).toBeTruthy();
    expect(screen.queryByText("private note to")).toBeNull();
    const composer = screen.getByLabelText("Message");
    expect(composer).toHaveAttribute("rows", "1");
    await user.type(composer, "Hello");
    fireEvent.keyDown(composer, { key: "Enter" });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ recipientId: "recipient", text: "Hello" })));
  });

  it("navigates after a successful send when Strict Mode rehearses the liveness effect", async () => {
    const user = userEvent.setup();
    render(<StrictMode><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><NewMessage username="ada" /></QueryClientProvider></StrictMode>);
    await screen.findByText("Ada");
    await user.type(screen.getByLabelText("Message"), "Hello");
    await user.click(screen.getByRole("button", { name: "send" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/messages/created"));
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

  it("clears private draft state when the route's authenticated actor changes", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><ActorScopedNewMessage actorId={actorId} username="ada" /></QueryClientProvider>);
    await screen.findByText("Ada");
    await user.type(screen.getByLabelText("Message"), "A private note");
    actorId = "actor-b";
    loadSocialProfile.mockResolvedValueOnce({ ok: false, failure: "notFound" });
    view.rerender(<QueryClientProvider client={client}><ActorScopedNewMessage actorId={actorId} username="ada" /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "This profile is unavailable" })).toBeTruthy();
    expect(screen.queryByDisplayValue("A private note")).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("retries an unavailable pair lookup before showing the composer", async () => {
    const user = userEvent.setup();
    findDirect.mockResolvedValueOnce({ ok: false, failure: "unavailable", message: "down" }).mockResolvedValueOnce({ ok: false, failure: "notFound", message: "missing" });
    renderDraft();
    expect(await screen.findByRole("heading", { name: "Conversation lookup is unavailable" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "send" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry lookup" }));
    expect(await screen.findByRole("button", { name: "send" })).toBeInTheDocument();
    expect(findDirect).toHaveBeenCalledTimes(2);
  });

  it("does not offer send when pair lookup fails", async () => {
    findDirect.mockResolvedValue({ ok: false, failure: "unavailable", message: "down" });
    renderDraft();
    expect(await screen.findByRole("heading", { name: "Conversation lookup is unavailable" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "send" })).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), status: vi.fn(), password: vi.fn(), request: vi.fn(), cancel: vi.fn(), google: vi.fn(), key: vi.fn(),
}));
vi.mock("@/lib/session/hooks", () => ({ useSession: mocks.session }));
vi.mock("@/lib/account/deletion", () => ({
  getDeletionStatus: mocks.status, proveDeletionWithPassword: mocks.password,
  requestDeletion: mocks.request, cancelDeletion: mocks.cancel,
  beginGoogleDeletionProof: mocks.google, deletionIdempotencyKey: mocks.key,
}));
import { DeletionPanel } from "./DeletionPanel";

const active = { state: "active", generation: 0, requestId: null, requestedAt: null, cancelUntil: null, purgeDueAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockReturnValue({ user: { id: "owner" }, isPending: false });
  mocks.status.mockResolvedValue(active);
  mocks.key.mockReturnValue("idempotency-key-0001");
});

describe("account deletion owner flow", () => {
  it("warns when request activation is absent and never asks for a proof", async () => {
    render(<DeletionPanel requestEnabled={false} />);
    await screen.findByText(/not available yet/);
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(mocks.password).not.toHaveBeenCalled();
  });

  it("requires explicit consent and a fresh action-bound password proof before one idempotent request", async () => {
    mocks.password.mockResolvedValue("a".repeat(64));
    mocks.request.mockResolvedValue(undefined);
    mocks.status.mockResolvedValue(active);
    render(<DeletionPanel requestEnabled />);
    await screen.findByText("Status: active");
    const submit = screen.getByRole("button", { name: "Request deletion" });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "current-password" } });
    fireEvent.click(submit);
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith("a".repeat(64), "idempotency-key-0001"));
    expect(mocks.password).toHaveBeenCalledWith("request_deletion", "current-password");
  });

  it("uses the cancellation action only while the database-backed pending state is returned", async () => {
    mocks.status.mockResolvedValue({ ...active, state: "pending_deletion", cancelUntil: "2026-10-09T09:00:00.000Z" });
    mocks.password.mockResolvedValue("b".repeat(64));
    render(<DeletionPanel requestEnabled={false} />);
    await screen.findByRole("button", { name: "Cancel deletion" });
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "current-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel deletion" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith("b".repeat(64)));
    expect(mocks.password).toHaveBeenCalledWith("cancel_deletion", "current-password");
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ status: vi.fn(), request: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/session/hooks", () => ({ useSession: mocks.session }));
vi.mock("@/lib/export/account-export", () => ({
  getAccountExportStatus: mocks.status, requestAccountExport: mocks.request,
  accountExportDownloadUrl: (id: string) => `https://api.example.test/api/v1/account/export/${id}/download`,
}));
import { ExportPanel } from "./ExportPanel";

const requestId = "c09fd9f4-f274-47c3-8b8c-55fa54d9c335";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockReturnValue({ user: { id: "owner" }, isPending: false });
});

describe("account export client journey", () => {
  it("never sends a request while the release gate is disabled", () => {
    render(<ExportPanel enabled={false} />);
    expect(screen.getByText(/not available yet/)).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("shows a ready archive through the authenticated API, not a signed R2 URL", async () => {
    mocks.status.mockResolvedValue({ requestId, status: "ready", requestedAt: "2026-10-01T00:00:00Z",
      readyAt: "2026-10-02T00:00:00Z", expiresAt: "2026-10-03T00:00:00Z" });
    render(<ExportPanel enabled />);
    const link = await screen.findByRole("link", { name: "Download ZIP" });
    expect(link).toHaveAttribute("href", `https://api.example.test/api/v1/account/export/${requestId}/download`);
    expect(screen.getByText(/Available until/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request export" })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("requests once and refreshes the server state", async () => {
    mocks.status.mockResolvedValueOnce({ requestId: null, status: "none", requestedAt: null, readyAt: null, expiresAt: null })
      .mockResolvedValueOnce({ requestId, status: "building", requestedAt: "2026-10-01T00:00:00Z", readyAt: null, expiresAt: null });
    mocks.request.mockResolvedValue({ requestId, status: "requested" });
    render(<ExportPanel enabled />);
    await screen.findByText("Status: none");
    fireEvent.click(screen.getByRole("button", { name: "Request export" }));
    await waitFor(() => expect(screen.getByText("Status: building")).toBeInTheDocument());
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
});

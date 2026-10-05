import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "account-1" } as { id: string } | null,
  policy: vi.fn(),
  refresh: vi.fn(),
  router: { replace: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/account/deletion",
  useSearchParams: () => ({ toString: () => "" }),
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/session/hooks", () => ({
  useSession: () => ({ user: mocks.user, isPending: false, refresh: mocks.refresh }),
}));
vi.mock("@/lib/legal/acceptance", () => ({
  LegalAcceptanceError: class LegalAcceptanceError extends Error {
    constructor(public status: number) { super(); }
  },
  readAccountPolicy: mocks.policy,
}));
vi.mock("./DeletionPanel", () => ({
  DeletionPanel: ({ requestEnabled }: { requestEnabled: boolean }) => <p>{requestEnabled ? "enabled" : "disabled"}</p>,
}));
import AccountDeletionPage from "./page";

describe("account deletion entry gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "account-1" };
  });

  it("keeps deletion requests disabled for an eligible owner", async () => {
    mocks.policy.mockResolvedValue({ restriction: "active", allowed: [] });
    vi.stubEnv("NEXT_PUBLIC_STAGING_ACCOUNT_DELETION_APPROVED", "request-deletion-staging");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_PROXY_ENABLED", "true");
    vi.stubEnv("NEXT_PUBLIC_WEB_API_BASE_URL", "https://staging.dayli.agroupforcoders.com");
    render(<AccountDeletionPage />);
    expect(await screen.findByText("disabled")).toBeInTheDocument();
  });

  it("lets a pending owner reach cancellation without the username gate", async () => {
    mocks.policy.mockResolvedValue({ restriction: "pending_deletion", allowed: ["cancel_deletion"] });
    render(<AccountDeletionPage />);
    expect(await screen.findByText("disabled")).toBeInTheDocument();
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it.each(["terms_blocked", "age_declaration_blocked"])("redirects %s before mounting the deletion panel", async (restriction) => {
    mocks.policy.mockResolvedValue({ restriction, allowed: [] });
    render(<AccountDeletionPage />);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/legal/acceptance"));
    expect(screen.queryByText("disabled")).toBeNull();
  });

  it("sends a signed-out owner to sign-in before mounting the deletion panel", async () => {
    mocks.user = null;
    render(<AccountDeletionPage />);
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/sign-in?next=%2Faccount%2Fdeletion"));
    expect(mocks.policy).not.toHaveBeenCalled();
    expect(screen.queryByText("disabled")).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(), refresh: vi.fn(), current: vi.fn(), record: vi.fn(), policy: vi.fn(), signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/session/hooks", () => ({
  useSession: () => ({ user: { id: "account-1" }, isPending: false, refresh: mocks.refresh }),
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut: mocks.signOut } }));
vi.mock("@/lib/legal/registration", () => ({ readCurrentRegistrationTerms: mocks.current }));
vi.mock("@/lib/legal/acceptance", () => ({
  LegalAcceptanceError: class LegalAcceptanceError extends Error { constructor(public status: number) { super(); } },
  readAccountPolicy: mocks.policy,
  recordLegalAcceptance: mocks.record,
}));

import { LegalAcceptanceError } from "@/lib/legal/acceptance";
import LegalAcceptancePage from "./page";

const terms = { status: "effective" as const, termsVersionId: "terms-v2", termsContentDigest: "a".repeat(64), ageDeclarationVersion: "age-16-v1" };

describe("existing-account legal acceptance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refreshes the session and returns to sign-in after an expired acceptance", async () => {
    mocks.current.mockResolvedValue(terms);
    mocks.record.mockRejectedValue(new LegalAcceptanceError(401));
    mocks.refresh.mockResolvedValue(undefined);
    render(<LegalAcceptancePage />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /I agree to the Terms/i }));
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in?next=%2Flegal%2Facceptance"));
    expect(mocks.policy).not.toHaveBeenCalled();
  });

  it("shows one unchecked action, sends the displayed version, and waits for policy confirmation", async () => {
    mocks.current.mockResolvedValue(terms);
    mocks.record.mockResolvedValue(undefined);
    mocks.policy.mockResolvedValue({ restriction: "active", allowed: ["ordinary"] });
    render(<LegalAcceptancePage />);

    const action = await screen.findByRole("checkbox", { name: /I agree to the Terms/i });
    expect(action).not.toBeChecked();
    expect(screen.getByText("Terms version: terms-v2")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    fireEvent.click(action);
    fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));

    await waitFor(() => expect(mocks.record).toHaveBeenCalledWith(terms));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/home"));
    expect(mocks.refresh).toHaveBeenCalled();
  });
});

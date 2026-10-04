import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

import LegalAcceptancePage from "./page";

const terms = { status: "effective" as const, termsVersionId: "terms-v2", termsContentDigest: "a".repeat(64), ageDeclarationVersion: "age-16-v1" };

describe("existing-account legal acceptance", () => {
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

  it("awaits sign-out, refreshes the mounted session, then leaves for a public route", async () => {
    mocks.signOut.mockReset();
    mocks.refresh.mockReset();
    mocks.replace.mockReset();
    let finishSignOut!: () => void;
    mocks.signOut.mockImplementation(() => new Promise<void>((resolve) => { finishSignOut = resolve; }));
    mocks.refresh.mockResolvedValue(undefined);
    render(<LegalAcceptancePage />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();

    finishSignOut();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(mocks.refresh.mock.invocationCallOrder[0]);
    expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(mocks.replace.mock.invocationCallOrder[0]);
  });
});

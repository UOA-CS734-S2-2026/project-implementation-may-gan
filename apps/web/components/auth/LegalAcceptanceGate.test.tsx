import { render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LegalAcceptanceGate } from "./LegalAcceptanceGate";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), policy: vi.fn() }));

vi.mock("@/lib/session/hooks", () => ({
  useSession: () => ({ user: null, isPending: false }),
}));
vi.mock("@/lib/legal/acceptance", () => ({ readAccountPolicy: mocks.policy }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

it("redirects a signed-out protected route instead of leaving its gate blank", async () => {
  render(<LegalAcceptanceGate><p>Private settings</p></LegalAcceptanceGate>);

  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in?next=%2Fsettings"));
  expect(mocks.policy).not.toHaveBeenCalled();
});

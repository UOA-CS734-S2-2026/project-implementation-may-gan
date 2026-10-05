import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/home",
  query: "",
  user: { id: "account-1" } as { id: string } | null,
  router: { replace: vi.fn() },
  refresh: vi.fn(),
  policy: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => ({ toString: () => mocks.query }),
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

import { LegalAcceptanceError } from "@/lib/legal/acceptance";
import { LegalAcceptanceGate } from "./LegalAcceptanceGate";

function protectedView() {
  return <LegalAcceptanceGate><div data-testid="private">Private content</div></LegalAcceptanceGate>;
}

describe("LegalAcceptanceGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/home";
    mocks.query = "";
    mocks.user = { id: "account-1" };
  });

  it("does not mount the next route while its policy check is pending", async () => {
    let resolveNext!: (value: { restriction: string; allowed: string[] }) => void;
    mocks.policy.mockResolvedValueOnce({ restriction: "active", allowed: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    const view = render(protectedView());
    await screen.findByTestId("private");
    mocks.pathname = "/settings";
    view.rerender(protectedView());
    expect(screen.queryByTestId("private")).toBeNull();
    resolveNext({ restriction: "terms_blocked", allowed: [] });
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/legal/acceptance"));
    expect(screen.queryByTestId("private")).toBeNull();
  });

  it("refreshes an expired session and preserves the full return path", async () => {
    mocks.pathname = "/messages";
    mocks.query = "tab=inbox&filter=unread";
    mocks.policy.mockRejectedValue(new LegalAcceptanceError(401));
    mocks.refresh.mockResolvedValue(undefined);
    render(protectedView());
    const destination = "/sign-in?next=%2Fmessages%3Ftab%3Dinbox%26filter%3Dunread";
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith(destination));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByTestId("private")).toBeNull();
  });

  it("sends a signed-out visitor to sign-in with the full return path", async () => {
    mocks.user = null;
    mocks.pathname = "/messages";
    mocks.query = "tab=inbox";
    render(protectedView());
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/sign-in?next=%2Fmessages%3Ftab%3Dinbox"));
    expect(mocks.policy).not.toHaveBeenCalled();
  });
});

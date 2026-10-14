import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/messages",
  query: "tab=inbox&filter=unread",
  user: null as { id: string } | null,
  router: { replace: vi.fn() },
  profile: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => mocks.router,
}));
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: mocks.user, isPending: false }) }));
vi.mock("@/lib/profile/username", () => ({ getUsernameProfile: mocks.profile }));

import { UsernameSetupGate } from "./UsernameSetupGate";

function protectedView() {
  return <UsernameSetupGate><p>protected</p></UsernameSetupGate>;
}

describe("UsernameSetupGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.pathname = "/messages";
    mocks.query = "tab=inbox&filter=unread";
    mocks.user = null;
  });

  it("preserves the actual client route path and query for a signed-out deep link", async () => {
    render(protectedView());
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/sign-in?next=%2Fmessages%3Ftab%3Dinbox%26filter%3Dunread"));
  });

  it("reuses username readiness across navigation and session object refreshes", async () => {
    mocks.user = { id: "account-1" };
    mocks.profile.mockResolvedValue({ needsUsernameSetup: false });
    const view = render(protectedView());
    await screen.findByText("protected");
    mocks.pathname = "/settings";
    mocks.query = "";
    mocks.user = { id: "account-1" };
    view.rerender(protectedView());
    expect(screen.getByText("protected")).toBeInTheDocument();
    expect(mocks.profile).toHaveBeenCalledTimes(1);
  });

  it("checks a new account before rendering its content", async () => {
    mocks.user = { id: "account-1" };
    mocks.profile.mockResolvedValueOnce({ needsUsernameSetup: false })
      .mockResolvedValueOnce({ needsUsernameSetup: true });
    const view = render(protectedView());
    await screen.findByText("protected");
    mocks.user = { id: "account-2" };
    view.rerender(protectedView());
    expect(screen.queryByText("protected")).toBeNull();
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/setup-username"));
  });

  it("checks readiness again after signing out and back into the same account", async () => {
    mocks.user = { id: "account-1" };
    mocks.profile.mockResolvedValueOnce({ needsUsernameSetup: false })
      .mockResolvedValueOnce({ needsUsernameSetup: true });
    const view = render(protectedView());
    await screen.findByText("protected");
    mocks.user = null;
    view.rerender(protectedView());
    mocks.user = { id: "account-1" };
    view.rerender(protectedView());
    expect(screen.queryByText("protected")).toBeNull();
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/setup-username"));
    expect(mocks.profile).toHaveBeenCalledTimes(2);
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/home",
  query: "",
  user: { id: "account-1" } as { id: string } | null,
  router: { replace: vi.fn() },
  refresh: vi.fn(),
  policy: vi.fn(),
  profile: vi.fn(),
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
vi.mock("@/lib/profile/username", () => ({ getUsernameProfile: mocks.profile }));

import { LegalAcceptanceError } from "@/lib/legal/acceptance";
import { LegalAcceptanceGate } from "./LegalAcceptanceGate";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { UsernameSetupGate } from "./UsernameSetupGate";

function CachedContent() {
  const client = useQueryClient();
  const cached = client.getQueryData<string>(["navigation-test"]);
  client.setQueryData(["navigation-test"], "retained");
  return <div data-testid="cached">{cached ?? "fresh"}</div>;
}

function protectedView() {
  return <LegalAcceptanceGate><div data-testid="private">Private content</div></LegalAcceptanceGate>;
}

describe("LegalAcceptanceGate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.pathname = "/home";
    mocks.query = "";
    mocks.user = { id: "account-1" };
    mocks.profile.mockResolvedValue({ needsUsernameSetup: false });
  });

  it("keeps the app mounted during navigation, then hides it if access is revoked", async () => {
    let resolveNext!: (value: { restriction: string; allowed: string[] }) => void;
    mocks.policy.mockResolvedValueOnce({ restriction: "active", allowed: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNext = resolve; }));
    const view = render(protectedView());
    await screen.findByTestId("private");
    mocks.pathname = "/settings";
    view.rerender(protectedView());
    expect(screen.getByTestId("private")).toBeInTheDocument();
    resolveNext({ restriction: "terms_blocked", allowed: [] });
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/legal/acceptance"));
    expect(screen.queryByTestId("private")).toBeNull();
  });

  it("retains the query cache across path and query changes", async () => {
    mocks.policy.mockResolvedValue({ restriction: "active", allowed: [] });
    const content = () => <LegalAcceptanceGate><UsernameSetupGate><QueryProvider><CachedContent /></QueryProvider></UsernameSetupGate></LegalAcceptanceGate>;
    const view = render(content());
    expect(await screen.findByTestId("cached")).toHaveTextContent("fresh");
    mocks.pathname = "/settings";
    view.rerender(content());
    expect(screen.getByTestId("cached")).toHaveTextContent("retained");
    await waitFor(() => expect(mocks.policy).toHaveBeenCalledTimes(2));
    mocks.query = "tab=profile";
    view.rerender(content());
    expect(screen.getByTestId("cached")).toHaveTextContent("retained");
    await waitFor(() => expect(mocks.policy).toHaveBeenCalledTimes(3));
    expect(mocks.profile).toHaveBeenCalledTimes(1);
  });

  it("keeps initially restricted accounts from mounting private content", async () => {
    mocks.policy.mockResolvedValue({ restriction: "terms_blocked", allowed: [] });
    render(protectedView());
    expect(screen.queryByTestId("private")).toBeNull();
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/legal/acceptance"));
    expect(screen.queryByTestId("private")).toBeNull();
  });

  it("rechecks initial access after signing out and back into the same account", async () => {
    mocks.policy.mockResolvedValueOnce({ restriction: "active", allowed: [] })
      .mockResolvedValueOnce({ restriction: "terms_blocked", allowed: [] });
    const view = render(protectedView());
    await screen.findByTestId("private");
    mocks.user = null;
    view.rerender(protectedView());
    mocks.user = { id: "account-1" };
    view.rerender(protectedView());
    expect(screen.queryByTestId("private")).toBeNull();
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/legal/acceptance"));
  });

  it("does not reuse another account's access or accept its late response", async () => {
    let resolvePrevious!: (value: { restriction: string; allowed: string[] }) => void;
    mocks.policy.mockResolvedValueOnce({ restriction: "active", allowed: [] })
      .mockImplementationOnce(() => new Promise((resolve) => { resolvePrevious = resolve; }))
      .mockResolvedValueOnce({ restriction: "age_declaration_blocked", allowed: [] });
    const view = render(protectedView());
    await screen.findByTestId("private");
    mocks.pathname = "/settings";
    view.rerender(protectedView());
    mocks.user = { id: "account-2" };
    view.rerender(protectedView());
    expect(screen.queryByTestId("private")).toBeNull();
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/legal/acceptance"));
    resolvePrevious({ restriction: "active", allowed: [] });
    await waitFor(() => expect(screen.queryByTestId("private")).toBeNull());
  });

  it("hides previously allowed content if background revalidation fails", async () => {
    mocks.policy.mockResolvedValueOnce({ restriction: "active", allowed: [] })
      .mockRejectedValueOnce(new Error("Unavailable"));
    const view = render(protectedView());
    await screen.findByTestId("private");
    mocks.pathname = "/settings";
    view.rerender(protectedView());
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith("/legal/acceptance?status=unavailable"));
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

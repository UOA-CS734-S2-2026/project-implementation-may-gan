import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountAccessProvider } from "@/lib/account/access-provider";
import { accountApiFetch } from "@/lib/account/access-events";
import { accessFreshnessMs } from "@/lib/account/access-store";
import { ProtectedAppGate } from "./ProtectedAppGate";

const mocks = vi.hoisted(() => ({
  pathname: "/home", query: "", user: { id: "one" } as { id: string } | null,
  session: { id: "session-one" } as { id: string } | null,
  refresh: vi.fn(async () => {}), replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: mocks.user, session: mocks.session, isPending: false, refresh: mocks.refresh }) }));
vi.mock("@/lib/api/config", () => ({ apiBaseUrl: "https://api.test" }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signOut: vi.fn() } }));
const active = { restriction: "active", allowed: ["ordinary"], onboarding: { legalAcceptanceRequired: false, usernameSetupRequired: false } };

function Content() {
  const [value, setValue] = useState(0);
  return <button onClick={() => setValue(value + 1)}>Private state {value}</button>;
}
function view() {
  return <AccountAccessProvider><ProtectedAppGate><Content /></ProtectedAppGate></AccountAccessProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "one" }; mocks.session = { id: "session-one" };
  mocks.pathname = "/home"; mocks.query = "";
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("protected app bootstrap", () => {
  it("keeps private state mounted and does not refetch on path or query changes", async () => {
    const fetch = vi.fn(async () => Response.json(active));
    vi.stubGlobal("fetch", fetch);
    const mounted = render(view());
    fireEvent.click(await screen.findByRole("button", { name: "Private state 0" }));
    mocks.pathname = "/settings"; mocks.query = "tab=profile";
    mounted.rerender(view());
    expect(screen.getByRole("button", { name: "Private state 1" })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent(window, new Event("focus"));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("schedules expiry from the latest snapshot rather than fixed timer ticks", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => Response.json(active));
    vi.stubGlobal("fetch", fetch);
    render(view());
    await act(async () => {});
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(100_000); });
    await act(async () => { await accountApiFetch("https://api.test/api/v1/legal/acceptance", { method: "POST" }); });
    expect(fetch).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(accessFreshnessMs - 100_000); });
    expect(fetch).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(100_000); });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("revalidates on focus when stale and removes private content on restriction", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(active)).mockResolvedValueOnce(Response.json({ ...active, restriction: "terms_blocked", onboarding: { ...active.onboarding, legalAcceptanceRequired: true } }));
    vi.stubGlobal("fetch", fetch);
    render(view());
    await screen.findByRole("button", { name: "Private state 0" });
    clock.mockReturnValue(1_000 + accessFreshnessMs);
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/legal/acceptance"));
    expect(screen.queryByText("Private state 0")).toBeNull();
  });

  it.each([
    [{ ...active, restriction: "terms_blocked", onboarding: { ...active.onboarding, legalAcceptanceRequired: true } }, "/legal/acceptance"],
    [{ ...active, onboarding: { ...active.onboarding, usernameSetupRequired: true } }, "/setup-username"],
  ])("does not mount private content before onboarding: %j", async (bootstrap, destination) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(bootstrap)));
    render(view());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(destination));
    expect(screen.queryByText("Private state 0")).toBeNull();
  });

  it("redirects signed-out visitors without fetching bootstrap", async () => {
    mocks.user = null; mocks.session = null;
    mocks.pathname = "/messages"; mocks.query = "tab=inbox";
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    render(view());
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-in?next=%2Fmessages%3Ftab%3Dinbox"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("discards cached access after sign-out and same-account sign-in", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(active)).mockResolvedValueOnce(Response.json({ ...active, restriction: "terms_blocked", onboarding: { ...active.onboarding, legalAcceptanceRequired: true } }));
    vi.stubGlobal("fetch", fetch);
    const mounted = render(view());
    await screen.findByRole("button", { name: "Private state 0" });
    mocks.user = null; mocks.session = null; mounted.rerender(view());
    mocks.user = { id: "one" }; mocks.session = { id: "session-one" }; mounted.rerender(view());
    expect(screen.queryByText("Private state 0")).toBeNull();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/legal/acceptance"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("ignores a previous account's late bootstrap", async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; })).mockResolvedValueOnce(Response.json({ ...active, restriction: "banned", allowed: ["signout"] }));
    vi.stubGlobal("fetch", fetch);
    const mounted = render(view());
    mocks.user = { id: "two" }; mocks.session = { id: "session-two" }; mounted.rerender(view());
    await screen.findByText("Account access is restricted");
    await act(async () => { resolve(Response.json(active)); });
    expect(screen.queryByText("Private state 0")).toBeNull();
  });

  it("reacts to structured API restrictions but not a resource-specific 403", async () => {
    const fetch = vi.fn(async () => Response.json(active)); vi.stubGlobal("fetch", fetch);
    render(view());
    await screen.findByRole("button", { name: "Private state 0" });
    fetch.mockImplementationOnce(async () => Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 }));
    await act(async () => { await accountApiFetch("https://api.test/api/v1/posts/private"); });
    expect(screen.getByText("Private state 0")).toBeInTheDocument();
    const restricted = { ...active, restriction: "terms_blocked", allowed: ["legal_acceptance"], onboarding: { ...active.onboarding, legalAcceptanceRequired: true } };
    fetch.mockImplementationOnce(async () => Response.json({ error: { code: "FORBIDDEN", details: { restriction: "terms_blocked", allowed: ["legal_acceptance"] } } }, { status: 403 }))
      .mockImplementationOnce(async () => Response.json(restricted));
    await act(async () => { await accountApiFetch("https://api.test/api/v1/posts"); });
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/legal/acceptance"));
    expect(screen.queryByText("Private state 0")).toBeNull();
  });

  it("fails closed with retry UI instead of mounting content on bootstrap errors", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(Response.json(active));
    vi.stubGlobal("fetch", fetch);
    render(view());
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("button", { name: "Private state 0" });
  });
});

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicLayout from "./layout";

let session: { user: { id: string } | null; isPending: boolean };

vi.mock("@/components/ui/layout/Navbar", () => ({ Navbar: () => <nav>App navigation</nav> }));
vi.mock("@/components/ui/layout/MobileNavCloseListener", () => ({ MobileNavCloseListener: () => null }));
vi.mock("./PublicIntentUsernameGate", () => ({ PublicIntentUsernameGate: () => null }));
vi.mock("@/lib/session/hooks", () => ({ useSession: () => session }));
vi.mock("@/features/messaging/shared/use-unread-query", () => ({
  useUnreadQuery: () => ({ data: { inboxCount: 0, requestCount: 0 } }),
}));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: {} }));
vi.mock("@/features/messaging/realtime/MessagingRealtime", () => ({
  MessagingRealtime: class { start() {} resume() {} stop() {} },
}));

describe("public layout frame", () => {
  beforeEach(() => { session = { user: null, isPending: false }; });

  it("keeps the app navigation for signed-in people", () => {
    session = { user: { id: "ada" }, isPending: false };
    render(<PublicLayout><p>Profile page</p></PublicLayout>);
    expect(screen.getByText("App navigation")).toBeTruthy();
    expect(screen.getByText("Profile page")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("shows visitors the public header with a sign-in link", () => {
    render(<PublicLayout><p>Profile page</p></PublicLayout>);
    expect(screen.queryByText("App navigation")).toBeNull();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(screen.getByText("Profile page")).toBeTruthy();
  });

  it("renders neither frame until the session is known", () => {
    session = { user: null, isPending: true };
    render(<PublicLayout><p>Profile page</p></PublicLayout>);
    expect(screen.queryByText("App navigation")).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });
});

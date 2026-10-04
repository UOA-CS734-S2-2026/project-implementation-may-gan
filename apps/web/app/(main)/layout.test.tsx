import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import AppLayout from "./layout";

let navbarClient: QueryClient | undefined;
let pageClient: QueryClient | undefined;

vi.mock("@/components/auth/UsernameSetupGate", () => ({
  UsernameSetupGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/auth/LegalAcceptanceGate", () => ({
  LegalAcceptanceGate: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/layout/Navbar", () => ({
  Navbar: () => {
    const client = useQueryClient();
    useEffect(() => { navbarClient = client; }, [client]);
    return <nav>Social navigation</nav>;
  },
}));
vi.mock("@/components/ui/layout/MobileNavCloseListener", () => ({
  MobileNavCloseListener: () => null,
}));
vi.mock("@/lib/session/hooks", () => ({
  useSession: () => ({ user: null, isPending: false }),
}));
vi.mock("@/features/messaging/shared/use-unread-query", () => ({
  useUnreadQuery: () => ({ data: { inboxCount: 0, requestCount: 0 } }),
}));
vi.mock("@/features/messaging/shared/messaging.api", () => ({ messagingApi: {} }));

function PageProbe() {
  const client = useQueryClient();
  useEffect(() => { pageClient = client; }, [client]);
  return <p>Social page</p>;
}

describe("authenticated layout query scope", () => {
  it("provides the same account-scoped query client to navigation and pages", () => {
    navbarClient = undefined;
    pageClient = undefined;
    render(<AppLayout><PageProbe /></AppLayout>);
    expect(screen.getByText("Social navigation")).toBeTruthy();
    expect(screen.getByText("Social page")).toBeTruthy();
    expect(navbarClient).toBeDefined();
    expect(navbarClient).toBe(pageClient);
  });
});

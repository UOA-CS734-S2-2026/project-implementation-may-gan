import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { Navbar } from "./Navbar";

vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: { id: "actor", name: "Ada Lovelace", email: "ada@example.com", image: null } }) }));
vi.mock("@/lib/profile/username", () => ({ getUsernameProfile: async () => ({ username: "ada", needsUsernameSetup: false }) }));
vi.mock("@/features/messaging/realtime/MessagingProvider", () => ({ useMessagingLive: () => ({ unread: { inboxCount: 0, requestCount: 0 } }) }));
vi.mock("./NavSearch", () => ({ NavSearch: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/home" }));

describe("Navbar", () => {
  it("sends my days to the profile and the account row to settings, as on mobile", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Navbar /></QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByRole("link", { name: /my days/ }).length).toBeGreaterThan(0));
    for (const link of screen.getAllByRole("link", { name: /my days/ })) expect(link.getAttribute("href")).toBe("/u/ada");
    const account = screen.getAllByRole("link", { name: /Ada Lovelace/ });
    expect(account.length).toBeGreaterThan(0);
    for (const link of account) expect(link.getAttribute("href")).toBe("/settings");
  });
});

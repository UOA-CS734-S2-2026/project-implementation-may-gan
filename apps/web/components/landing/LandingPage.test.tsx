import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), user: null as { id: string } | null, profile: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/lib/session/hooks", () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock("@/lib/profile/username", () => ({ getUsernameProfile: mocks.profile }));
import LandingPage from "./LandingPage";

afterEach(cleanup);
beforeEach(() => {
  mocks.user = null;
  mocks.replace.mockReset();
  mocks.profile.mockReset();
});

describe("landing account navigation", () => {
  it("sends signed-in visitors through the legal gate without requesting the ordinary profile", async () => {
    mocks.user = { id: "existing-user" };
    render(<LandingPage />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/home"));
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Opening your account...");
    expect(screen.getByRole("link", { name: "Continue to Dayli" }).getAttribute("href")).toBe("/home");
  });

  it("preserves the public landing for signed-out visitors", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});

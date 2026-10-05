import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkGoogleAccount } from "@/app/(main)/settings/_components/LinkGoogleAccount";

describe("LinkGoogleAccount", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Google as connected when the current user already has a Google account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { providerId: "credential" },
      { providerId: "google" },
    ]), { status: 200 })));

    render(<LinkGoogleAccount />);

    expect(screen.getByText("Checking Google connection...")).toBeTruthy();
    expect(await screen.findByText("Google connected")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect Google" })).toBeNull();
  });

  it("offers Google connection when no Google account is linked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { providerId: "credential" },
    ]), { status: 200 })));

    render(<LinkGoogleAccount />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Connect Google" })).toBeTruthy());
    expect(screen.queryByText("Google connected")).toBeNull();
  });
});

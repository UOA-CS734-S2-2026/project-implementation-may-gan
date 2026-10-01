import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ social: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signIn: { social: mocks.social } } }));

import { GoogleSignInButton } from "./GoogleSignInButton";

beforeEach(() => mocks.social.mockReset());

describe("GoogleSignInButton", () => {
  it("uses the current web origin with a valid relative deep-link callback", async () => {
    render(<GoogleSignInButton returnTo="/messages?tab=inbox" />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({
      provider: "google",
      callbackURL: `${window.location.origin}/messages?tab=inbox`,
      errorCallbackURL: `${window.location.origin}/sign-in?next=%2Fmessages%3Ftab%3Dinbox`,
    })));
  });

  it.each(["https://attacker.example", "//attacker.example", "/%252e%252e//attacker.example"])("falls back to fixed same-origin home callbacks for %s", async (returnTo) => {
    render(<GoogleSignInButton returnTo={returnTo} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({
      callbackURL: `${window.location.origin}/home`,
      errorCallbackURL: `${window.location.origin}/sign-in?next=%2Fhome`,
    })));
  });
});

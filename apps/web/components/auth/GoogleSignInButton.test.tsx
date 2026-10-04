import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ social: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { signIn: { social: mocks.social } } }));

import { GoogleSignInButton } from "./GoogleSignInButton";

beforeEach(() => {
  mocks.social.mockReset();
  mocks.social.mockResolvedValue({ data: {} });
});

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

  it("requests proof before starting Google OAuth and binds it to the start request", async () => {
    const prepareRegistration = vi.fn(async () => ({ token: "a".repeat(64), binding: "b".repeat(64), termsVersionId: "v1", expiresAt: "soon" }));
    render(<GoogleSignInButton prepareRegistration={prepareRegistration} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({
      fetchOptions: { headers: { "x-dayli-registration-intent": "a".repeat(64), "x-dayli-registration-binding": "b".repeat(64) } },
    })));
    expect(prepareRegistration).toHaveBeenCalledOnce();
  });

  it("does not start OAuth when the explicit action was not completed", async () => {
    const onRegistrationError = vi.fn();
    render(<GoogleSignInButton prepareRegistration={async () => { throw new Error("Confirm the Terms and that you are 16 or older."); }} onRegistrationError={onRegistrationError} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(onRegistrationError).toHaveBeenCalledWith("Confirm the Terms and that you are 16 or older."));
    expect(mocks.social).not.toHaveBeenCalled();
  });

  it.each(["https://attacker.example", "//attacker.example", "/%252e%252e//attacker.example", "/u/ada?intent=delete-account"])("falls back to fixed same-origin home callbacks for %s", async (returnTo) => {
    render(<GoogleSignInButton returnTo={returnTo} />);
    fireEvent.click(screen.getByRole("button", { name: /sign in with google/i }));
    await waitFor(() => expect(mocks.social).toHaveBeenCalledWith(expect.objectContaining({
      callbackURL: `${window.location.origin}/home`,
      errorCallbackURL: `${window.location.origin}/sign-in?next=%2Fhome`,
    })));
  });
});

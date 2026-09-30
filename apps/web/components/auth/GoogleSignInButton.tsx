"use client";

import { authClient } from "@/lib/auth/client";
import { apiBaseUrl } from "@/lib/api/config";
import { issueRegistrationIntent, registrationHeaders, type CanonicalTerms } from "@/lib/legal/client";

type Props = {
  mode?: "signIn" | "signUp";
  agreement?: { accepted: boolean; terms: CanonicalTerms | null };
  disabled?: boolean;
  onFailure?: (message: string) => void;
};

export function GoogleSignInButton({ mode = "signIn", agreement, disabled = false, onFailure }: Props) {
  async function handleGoogleSignIn() {
    if (mode === "signIn") {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/home`,
        errorCallbackURL: `${window.location.origin}/sign-in`,
      });
      return;
    }
    if (!agreement?.accepted || !agreement.terms || !apiBaseUrl) {
      onFailure?.("Read the current Terms, then confirm both declarations.");
      return;
    }
    try {
      const proof = await issueRegistrationIntent("google_browser");
      if (proof.terms.id !== agreement.terms.id || proof.terms.contentDigest !== agreement.terms.contentDigest) {
        onFailure?.("The Terms changed. Read the current version before continuing.");
        return;
      }
      const response = await fetch(`${apiBaseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...registrationHeaders(proof) },
        body: JSON.stringify({ provider: "google", callbackURL: `${window.location.origin}/home`, errorCallbackURL: `${window.location.origin}/sign-up`, disableRedirect: true }),
      });
      const body = await response.json().catch(() => undefined) as { url?: unknown } | undefined;
      if (!response.ok || typeof body?.url !== "string") {
        onFailure?.(response.status === 403 || response.status === 409 ? "The Terms changed. Read the current version before continuing." : "Google sign-in couldn't start. Try again.");
        return;
      }
      window.location.assign(body.url);
    } catch {
      onFailure?.("Google sign-in couldn't start. Try again.");
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void handleGoogleSignIn()}
      className="w-full min-h-11 rounded-lg bg-background-secondary pt-[10px] pb-[9px] font-sans text-sm text-foreground-secondary tracking-tight transition-opacity hover:opacity-80 hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
    >
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
      <span>{mode === "signUp" ? "Continue with Google" : "Sign in with Google"}</span>
    </button>
  );
}

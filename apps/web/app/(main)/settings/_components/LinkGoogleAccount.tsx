"use client";

import { FormEvent, useState } from "react";
import { apiBaseUrl } from "@/lib/api/config";

/** Starts an explicit, password-confirmed Google account link. */
export function LinkGoogleAccount() {
  const [password, setPassword] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || isSubmitting) return;
    setIsSubmitting(true);
    setError(undefined);

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/link-social`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          password,
          callbackURL: `${window.location.origin}/settings`,
          disableRedirect: true,
        }),
      });
      if (!response.ok) throw new Error("link-rejected");
      const result = await response.json() as { url?: unknown };
      if (typeof result.url !== "string" || result.url.length === 0) throw new Error("link-rejected");
      // The API binds this redirect to the password-confirming live session.
      window.location.assign(result.url);
    } catch {
      setError("We could not link Google. Check your current password and use the Google account with this email.");
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full rounded-lg border border-foreground/10 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-foreground/5"
      >
        Connect Google
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-foreground/10 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Connect Google</p>
        <p className="text-xs text-foreground/60">Enter your current password. The Google account must use the same email as your Dayli account.</p>
      </div>
      <input
        required
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-full rounded-md border border-foreground/15 bg-transparent px-3 py-2 text-sm"
        placeholder="Current password"
        aria-label="Current password"
      />
      {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {isSubmitting ? "Connecting..." : "Continue with Google"}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setPassword("");
            setError(undefined);
          }}
          className="rounded-md px-3 py-2 text-sm text-foreground/70"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

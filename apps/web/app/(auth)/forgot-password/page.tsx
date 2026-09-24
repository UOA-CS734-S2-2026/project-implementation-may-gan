"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/core/Button";
import { apiBaseUrl } from "@/lib/api/config";

type Notice = { kind: "error" | "success"; message: string } | undefined;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<Notice>();
  const [sending, setSending] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBaseUrl) {
      setNotice({ kind: "error", message: "Account recovery is not configured for this environment." });
      return;
    }
    setNotice(undefined);
    setSending(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/request-password-reset`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
      });
      if (!response.ok) throw new Error();
      // The same message is shown whether or not the account exists.
      setNotice({ kind: "success", message: "If that address has an account, a reset link is on its way." });
    } catch {
      setNotice({ kind: "error", message: "Account recovery could not start. Try again shortly." });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="flex flex-col gap-8" onSubmit={requestReset}>
      <p className="font-serif text-2xl font-semibold text-foreground tracking-tight">
        Forgot your password?
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="recovery-email" className="text-sm font-medium font-sans">Email</label>
        <input
          id="recovery-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="w-full bg-background-secondary px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-foreground/20 rounded-md"
        />
        {notice && (
          <p role="status" className={`text-sm ${notice.kind === "error" ? "text-danger" : "text-foreground-secondary"}`}>
            {notice.message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={sending} variant={{ weight: "secondary", size: "sm", color: "accent" }} arrow>
          {sending ? "Sending…" : "Send reset link"}
        </Button>
        <Button href="/sign-in" variant={{ weight: "secondary", size: "sm", color: "foreground" }}>
          Back to sign in
        </Button>
      </div>
    </form>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/core/Button";
import { apiBaseUrl } from "@/lib/api/config";

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string>();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    const url = new URL(window.location.href);
    const resetToken = url.searchParams.get("token");
    url.searchParams.delete("token");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setToken(resetToken ?? undefined);
    });
    return () => { cancelled = true; };
  }, []);

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBaseUrl || !token) {
      setMessage("This reset link is invalid or has expired.");
      return;
    }
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!response.ok) throw new Error();
      setToken(undefined);
      setPassword("");
      setMessage("Your password has been reset. You can now sign in.");
    } catch {
      setMessage("This reset link is invalid, expired, or could not be used.");
    }
  }

  return (
    <form className="flex flex-col gap-8" onSubmit={resetPassword}>
      <p className="font-serif text-2xl font-semibold text-foreground tracking-tight">
        Choose a new password
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor="new-password" className="text-sm font-medium font-sans">New password</label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          required
          className="w-full bg-background-secondary px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-foreground/20 rounded-md"
        />
        {message && <p role="status" className="text-sm text-foreground-secondary">{message}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant={{ weight: "secondary", size: "sm", color: "accent" }} arrow>
          Reset
        </Button>
        <Button href="/sign-in" variant={{ weight: "secondary", size: "sm", color: "foreground" }}>
          Sign in
        </Button>
      </div>
    </form>
  );
}

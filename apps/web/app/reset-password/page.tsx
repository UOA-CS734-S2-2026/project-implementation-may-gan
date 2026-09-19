"use client";

import { FormEvent, useEffect, useState } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

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
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="reset-title">
        <p className="eyebrow">Dayli</p>
        <h1 id="reset-title">Choose a new password.</h1>
        <form onSubmit={resetPassword} className="recovery-form">
          <label htmlFor="new-password">New password</label>
          <div className="field-row">
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
            <button type="submit">Reset</button>
          </div>
        </form>
        {message && <p className="notice" role="status">{message}</p>}
      </section>
    </main>
  );
}

"use client";

import { FormEvent, useState } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

type Notice = { kind: "error" | "success"; message: string } | undefined;

export default function Home() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<Notice>();

  async function continueWithGoogle() {
    if (!apiBaseUrl) {
      setNotice({ kind: "error", message: "Sign-in is not configured for this environment." });
      return;
    }
    setNotice(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/sign-in/social`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: window.location.origin }),
      });
      if (!response.ok) throw new Error();
      const body = await response.json() as { url?: string };
      if (!body.url) throw new Error();
      const destination = new URL(body.url);
      if (destination.protocol !== "https:" || destination.hostname !== "accounts.google.com") throw new Error();
      window.location.assign(destination);
    } catch {
      setNotice({ kind: "error", message: "Google sign-in could not start. Try again shortly." });
    }
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBaseUrl) {
      setNotice({ kind: "error", message: "Account recovery is not configured for this environment." });
      return;
    }
    setNotice(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/request-password-reset`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
      });
      if (!response.ok) throw new Error();
      setNotice({ kind: "success", message: "If that address has an account, a reset link is on its way." });
    } catch {
      setNotice({ kind: "error", message: "Account recovery could not start. Try again shortly." });
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="dayli-title">
        <p className="eyebrow">Dayli</p>
        <h1 id="dayli-title">A little room for your day.</h1>
        <p className="lede">Sign in to keep your reflections close.</p>
        <button className="google-button" type="button" onClick={continueWithGoogle}>
          <span aria-hidden="true">G</span>
          Continue with Google
        </button>
        <div className="rule"><span>or recover your password</span></div>
        <form onSubmit={requestReset} className="recovery-form">
          <label htmlFor="recovery-email">Email address</label>
          <div className="field-row">
            <input
              id="recovery-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button type="submit">Send link</button>
          </div>
        </form>
        {notice && <p className={`notice ${notice.kind}`} role="status">{notice.message}</p>}
      </section>
    </main>
  );
}

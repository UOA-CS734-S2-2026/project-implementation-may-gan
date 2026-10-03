"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { claimInitialUsername, getUsernameProfile } from "@/lib/profile/username";
import { authClient } from "@/lib/auth/client";
import { safeAuthenticationReturnPath } from "@/lib/routing/public-return-intent";

const usernamePattern = /^[a-z0-9][a-z0-9_]{2,29}$/;

function SetupUsernameForm() {
  const { user, isPending } = useSession();
  const router = useRouter();
  const returnTo = safeAuthenticationReturnPath(useSearchParams().get("next"), "/home");
  const [username, setUsername] = useState("");
  const [publicName, setPublicName] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!user) { router.replace("/sign-in"); return; }
    void getUsernameProfile().then((profile) => {
      if (!profile.needsUsernameSetup) router.replace(returnTo);
    }).catch(() => router.replace("/sign-in"));
  }, [isPending, returnTo, router, user]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const handle = username.trim().toLowerCase();
    if (!usernamePattern.test(handle)) {
      setError("Use 3-30 lowercase letters, numbers, or underscores.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await claimInitialUsername(handle, publicName);
      router.replace(returnTo);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your username.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
    <form onSubmit={submit} className="w-full rounded-2xl bg-background p-7 shadow-card">
      <p className="font-serif text-sm font-semibold text-foreground-tertiary">one last thing</p>
      <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight">Choose your username</h1>
      <p className="mt-3 text-sm text-foreground-secondary">This is how friends find you. It cannot be changed here after setup.</p>
      <label className="mt-7 block text-sm font-semibold" htmlFor="username">Username</label>
      <div className="mt-2 flex items-center rounded-lg border border-foreground/15 px-3 focus-within:border-foreground-accent"><span>@</span><input id="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} autoComplete="username" className="w-full bg-transparent px-1 py-3 outline-none" /></div>
      <p className="mt-1 text-xs text-foreground-tertiary">Lowercase letters, numbers, and underscores.</p>
      <label className="mt-6 block text-sm font-semibold" htmlFor="public-name">Public name <span className="font-normal text-foreground-tertiary">(optional)</span></label>
      <input id="public-name" value={publicName} onChange={(event) => setPublicName(event.target.value)} autoComplete="name" maxLength={80} className="mt-2 w-full rounded-lg border border-foreground/15 bg-transparent px-3 py-3 outline-none focus:border-foreground-accent" />
      <p className="mt-1 text-xs text-foreground-tertiary">Leave blank to appear as @{username || "your username"}. We do not publish a name from Google.</p>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      <button disabled={saving} className="mt-7 rounded-lg bg-background-accent px-5 py-3 font-serif font-semibold text-foreground-accent disabled:opacity-50">{saving ? "Saving…" : "Continue"}</button>
      <button type="button" onClick={() => void authClient.signOut()} className="ml-4 text-sm underline">Sign out</button>
    </form>
  </main>;
}

export default function SetupUsernamePage() {
  return <Suspense fallback={null}><SetupUsernameForm /></Suspense>;
}

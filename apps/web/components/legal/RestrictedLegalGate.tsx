"use client";

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useSessionContext } from "@/lib/session/provider";
import { acceptTerms, loadCurrentTerms, loadNotice, readAccountPolicy, type AccountPolicy, type CanonicalTerms, type TermsNotice } from "@/lib/legal/client";
import { LegalLinks } from "./LegalLinks";

function CanonicalTermsView({ terms }: { terms: CanonicalTerms }) {
  return <div className="mt-4 rounded-lg border border-foreground/15 bg-background p-4">
    <p className="font-medium">Terms of Service, version {terms.version}</p>
    <p className="mt-1 text-xs text-foreground-secondary">Effective {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(terms.effectiveAt))} UTC. Verified digest {terms.contentDigest.slice(0, 12)}...</p>
    <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-foreground-secondary">{terms.canonicalContent}</pre>
  </div>;
}

function Notice({ notice }: { notice: TermsNotice }) {
  if (!notice.materialChange) return null;
  return <aside className="mb-5 rounded-xl border border-foreground-accent/30 bg-background-accent p-4 text-sm text-foreground-accent" aria-label="Terms notice">
    <p className="font-semibold">Upcoming Terms of Service, version {notice.version}</p>
    <p className="mt-1">Effective {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(notice.effectiveAt))} UTC.</p>
    {notice.urgentChangeReason ? <p className="mt-1">{notice.urgentChangeReason}</p> : null}
    <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6">{notice.canonicalContent}</pre>
  </aside>;
}

export function RestrictedLegalGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useSessionContext();
  const [policy, setPolicy] = useState<AccountPolicy | null>(null);
  const [terms, setTerms] = useState<CanonicalTerms | null>(null);
  const [notice, setNotice] = useState<TermsNotice | null>(null);
  const [read, setRead] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [ageChecked, setAgeChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    setPolicy(null);
    try {
      const current = await readAccountPolicy();
      setPolicy(current);
      if (current.restriction === "terms_blocked" || current.restriction === "age_declaration_blocked") {
        const canonical = await loadCurrentTerms();
        if (!canonical) throw new Error("Current Terms are unavailable. You cannot continue yet.");
        setTerms(canonical);
      } else if (current.restriction === "active") {
        loadNotice().then(setNotice).catch(() => setNotice(null));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Account status is unavailable. Try again.");
    }
  }, []);

  useEffect(() => {
    if (isPending || !user) return;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [isPending, refresh, user]);

  if (isPending || !user) return <>{children}</>;
  if (policy?.restriction === "active") return <>{notice ? <div className="mx-auto max-w-3xl px-5 pt-5"><Notice notice={notice} /></div> : null}{children}</>;

  const legalBlocked = policy?.restriction === "terms_blocked" || policy?.restriction === "age_declaration_blocked";
  async function submit() {
    if (!terms || !read || !termsChecked || !ageChecked) return;
    setBusy(true);
    setError(null);
    try {
      await acceptTerms(terms);
      await refresh();
    } catch (cause) {
      setRead(false);
      setTermsChecked(false);
      setAgeChecked(false);
      setError(cause instanceof Error ? cause.message : "Your acceptance could not be recorded. Try again.");
    } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-background px-5 py-10"><section className="mx-auto max-w-2xl rounded-2xl border border-foreground/15 bg-background-secondary p-6 shadow-sm">
    <p className="font-serif text-2xl font-semibold tracking-tight">{legalBlocked ? "Review the current Terms" : "Account access is restricted"}</p>
    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error} <button type="button" onClick={() => void refresh()} className="underline">Retry</button></p> : null}
    {!policy && !error ? <p className="mt-3 text-sm text-foreground-secondary">Checking account status...</p> : null}
    {legalBlocked ? <>
      <p className="mt-3 text-sm leading-6 text-foreground-secondary">Normal app access stays unavailable until the server records your current Terms agreement and separate age declaration.</p>
      {terms ? <><CanonicalTermsView terms={terms} />
        <button type="button" onClick={() => setRead(true)} className="mt-4 min-h-11 text-sm font-medium text-foreground-accent underline underline-offset-4">{read ? `Read version ${terms.version}` : `I have read version ${terms.version}`}</button>
        <label className="mt-4 flex items-start gap-3 text-sm"><input aria-label="Agree to the current Terms" type="checkbox" checked={termsChecked} disabled={!read || busy} onChange={(event) => setTermsChecked(event.target.checked)} className="mt-1 size-4" />I agree to the current Terms of Service.</label>
        <label className="mt-3 flex items-start gap-3 text-sm"><input aria-label="Declare that you are 16 or older" type="checkbox" checked={ageChecked} disabled={!read || busy} onChange={(event) => setAgeChecked(event.target.checked)} className="mt-1 size-4" />I declare that I am 16 or older.</label>
        <button type="button" disabled={!read || !termsChecked || !ageChecked || busy} onClick={() => void submit()} className="mt-5 min-h-11 rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50">{busy ? "Saving..." : "Continue"}</button>
      </> : null}
    </> : policy ? <p className="mt-3 text-sm leading-6 text-foreground-secondary">{policy.restriction === "underage_restricted" ? "This restriction cannot be changed with an age declaration." : "This account has limited access. Account management endpoints are not available in this client yet."}</p> : null}
    <div className="mt-6 border-t border-foreground/15 pt-4"><LegalLinks className="text-sm text-foreground-secondary" /><button type="button" onClick={() => void authClient.signOut()} className="mt-4 min-h-11 text-sm text-danger underline underline-offset-4">Sign out</button></div>
  </section></main>;
}

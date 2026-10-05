"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { LegalAcceptanceError, readAccountPolicy, recordLegalAcceptance } from "@/lib/legal/acceptance";
import { readCurrentRegistrationTerms, type CurrentRegistrationTerms } from "@/lib/legal/registration";
import { useSession } from "@/lib/session/hooks";

export default function LegalAcceptancePage() {
  const router = useRouter();
  const { user, isPending, refresh } = useSession();
  const [terms, setTerms] = useState<CurrentRegistrationTerms | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const load = async () => {
    setLoading(true);
    setAccepted(false);
    setError(undefined);
    try {
      setTerms(await readCurrentRegistrationTerms());
    } catch {
      setTerms(null);
      setError("Current Terms cannot be verified right now. Try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => { void load(); });
  }, []);
  useEffect(() => {
    if (!isPending && !user) router.replace("/sign-in?next=%2Flegal%2Facceptance");
  }, [isPending, router, user]);

  const submit = async () => {
    if (!terms || terms.status !== "effective" || !accepted || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await recordLegalAcceptance(terms);
      // The acceptance response proves it was recorded; policy confirmation is
      // the separate fence that reopens ordinary routes.
      const policy = await readAccountPolicy();
      if (policy.restriction === "terms_blocked" || policy.restriction === "age_declaration_blocked") {
        throw new LegalAcceptanceError(409);
      }
      await refresh();
      router.replace("/home");
    } catch (reason) {
      setAccepted(false);
      if (reason instanceof LegalAcceptanceError && reason.status === 401) {
        await refresh().catch(() => {});
        router.replace("/sign-in?next=%2Flegal%2Facceptance");
      } else if (reason instanceof LegalAcceptanceError && reason.status === 409) {
        setError("The Terms have changed. Review the current documents and try again.");
        void load();
      } else {
        setError("Legal acceptance is unavailable right now. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!isPending && !user) return null;

  const effective = terms?.status === "effective";
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-16">
    <div className="space-y-2">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Review Dayli&apos;s Terms</h1>
      <p className="text-foreground-secondary">To continue using your account, review the current approved documents and explicitly confirm them.</p>
      {effective && <p className="text-sm text-foreground-secondary">Terms version: {terms.termsVersionId}</p>}
    </div>
    <p className="text-sm text-foreground-secondary"><Link className="underline underline-offset-2" href="/terms">Terms of Service</Link>{" · "}<Link className="underline underline-offset-2" href="/privacy">Privacy Policy</Link></p>
    {loading ? <p>Loading current Terms…</p> : effective ? <>
      <label className="flex items-start gap-3 text-sm leading-6 text-foreground-secondary" htmlFor="legal-acceptance-action">
        <input id="legal-acceptance-action" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy} className="mt-1 size-4 shrink-0 accent-foreground" />
        <span>I agree to the Terms of Service, acknowledge the Privacy Policy, and confirm I am 16 or older.</span>
      </label>
      <button type="button" onClick={() => void submit()} disabled={!accepted || busy} className="w-fit rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50">
        {busy ? "Confirming…" : "Accept and continue"}
      </button>
    </> : <p role="alert">Current Terms cannot be verified right now. Try again.</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    <div className="flex flex-wrap gap-4 text-sm">
      <button type="button" className="underline" onClick={() => void load()} disabled={loading || busy}>Retry</button>
      <Link className="underline" href="/account/export">Your data export</Link>
      <button type="button" className="underline" onClick={() => void authClient.signOut()}>Sign out</button>
    </div>
  </main>;
}

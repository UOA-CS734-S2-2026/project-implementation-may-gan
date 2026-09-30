"use client";

import { useEffect, useState } from "react";
import { LegalLinks } from "./LegalLinks";
import { loadCurrentTerms, type CanonicalTerms } from "@/lib/legal/client";

type LegalAgreementProps = {
  onChange: (value: { accepted: boolean; terms: CanonicalTerms | null }) => void;
  disabled?: boolean;
};

export function LegalAgreement({ onChange, disabled = false }: LegalAgreementProps) {
  const [terms, setTerms] = useState<CanonicalTerms | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [age, setAge] = useState(false);

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => onChange({ accepted: read && accepted && age && terms !== null, terms }), [accepted, age, read, terms, onChange]);

  async function reload() {
    setError(null);
    setRead(false);
    setAccepted(false);
    setAge(false);
    try {
      const current = await loadCurrentTerms();
      if (!current) {
        setError("Registration is unavailable until current Terms are published.");
        return;
      }
      setTerms(current);
    } catch (cause) {
      setTerms(null);
      setError(cause instanceof Error ? cause.message : "Legal information is unavailable. Try again.");
    }
  }

  return (
    <fieldset className="rounded-xl border border-foreground/15 bg-background-secondary p-4" disabled={disabled}>
      <legend className="px-1 font-serif text-base font-semibold">Before you create an account</legend>
      <p className="mt-2 text-xs leading-5 text-foreground-secondary">Privacy information is available separately. It is not an agreement checkbox.</p>
      <LegalLinks className="mt-2 text-xs text-foreground-secondary" />
      {error ? <div role="alert" className="mt-3 text-sm text-danger">{error} <button type="button" onClick={() => void reload()} className="underline">Retry</button></div> : null}
      {terms ? <>
        <div className="mt-4 rounded-lg border border-foreground/10 bg-background p-3">
          <p className="text-sm font-medium">Terms of Service, version {terms.version}</p>
          <p className="mt-1 text-xs text-foreground-secondary">Effective {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(terms.effectiveAt))} UTC. Verified digest {terms.contentDigest.slice(0, 12)}...</p>
          <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-foreground-secondary">{terms.canonicalContent}</pre>
          <button type="button" onClick={() => setRead(true)} className="mt-3 min-h-11 rounded-md px-2 text-sm font-medium text-foreground-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground-accent">
            {read ? `Read version ${terms.version}` : `I have read version ${terms.version}`}
          </button>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-5 text-foreground-secondary">
          <input aria-label="Agree to the Terms of Service" type="checkbox" checked={accepted} disabled={!read} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 size-4 accent-foreground-accent" />
          <span>I agree to the Terms of Service, version {terms.version}.</span>
        </label>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-5 text-foreground-secondary">
          <input aria-label="Declare that you are 16 or older" type="checkbox" checked={age} disabled={!read} onChange={(event) => setAge(event.target.checked)} className="mt-1 size-4 accent-foreground-accent" />
          <span>I declare that I am 16 or older.</span>
        </label>
      </> : null}
    </fieldset>
  );
}

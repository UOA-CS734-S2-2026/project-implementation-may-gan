"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "@/lib/session/hooks";
import {
  beginGoogleDeletionProof,
  cancelDeletion,
  deletionIdempotencyKey,
  getDeletionStatus,
  proveDeletionWithPassword,
  requestDeletion,
  type AccountDeletionStatus,
  type DeletionAction,
} from "@/lib/account/deletion";

export function DeletionPanel({ requestEnabled }: { requestEnabled: boolean }) {
  const { user, isPending } = useSession();
  const [status, setStatus] = useState<AccountDeletionStatus | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const userId = user?.id;

  const refresh = async () => {
    setError(undefined);
    try { setStatus(await getDeletionStatus()); }
    catch { setError("Deletion status is unavailable. Try again later."); }
  };
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void getDeletionStatus().then((next) => {
      if (active) setStatus(next);
    }).catch(() => {
      if (active) setError("Deletion status is unavailable. Try again later.");
    });
    return () => { active = false; };
  }, [userId]);

  if (isPending) return <p>Checking your session…</p>;
  if (!user) return <p>Sign in to manage account deletion.</p>;

  const pending = status?.state === "pending_deletion";
  const action: DeletionAction = pending ? "cancel_deletion" : "request_deletion";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !password || (!pending && !confirmed) || (!pending && !requestEnabled)) return;
    setBusy(true);
    setError(undefined);
    try {
      const token = await proveDeletionWithPassword(action, password);
      if (pending) await cancelDeletion(token);
      else await requestDeletion(token, deletionIdempotencyKey());
      setPassword("");
      setConfirmed(false);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error && reason.message === "google-required"
        ? "This account requires fresh Google verification."
        : pending ? "Deletion could not be cancelled. Try again later." : "Deletion could not be requested. Try again later.");
    } finally { setBusy(false); }
  };
  const startGoogle = async () => {
    if (busy || (!pending && !requestEnabled)) return;
    setBusy(true);
    setError(undefined);
    try { window.location.assign(await beginGoogleDeletionProof(action)); }
    catch { setError("Google verification is unavailable. Try another sign-in method or try again later."); setBusy(false); }
  };

  return <section aria-label="Account deletion" className="space-y-4 rounded-lg border border-red-500/30 p-4">
    <div className="space-y-1">
      <h2 className="text-sm font-medium">Delete account</h2>
      <p className="text-sm text-foreground/70">This affects your account, not posts in Trash. Request a data export separately if you need a copy.</p>
    </div>
    {status && <p role="status">Status: {status.state.replaceAll("_", " ")}</p>}
    {pending && status?.cancelUntil && <p>You can cancel while the server reports cancellation available, currently until {new Date(status.cancelUntil).toLocaleString()}.</p>}
    {!pending && !requestEnabled && <p role="note">Account deletion requests are not available yet. This build will not submit a deletion request until the protected staging activation is complete.</p>}
    {pending || requestEnabled ? <form onSubmit={submit} className="space-y-3">
      {!pending && <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />I understand this requests account deletion. I have saved anything I need.</label>}
      <label className="block text-sm">Current password
        <input aria-label="Current password" required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded border border-foreground/20 bg-transparent px-3 py-2" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || (!pending && !confirmed)}>{busy ? "Working…" : pending ? "Cancel deletion" : "Request deletion"}</button>
        <button type="button" disabled={busy} onClick={() => void startGoogle()}>Verify with Google instead</button>
      </div>
      <p className="text-xs text-foreground/60">Google verification opens the provider in this browser and is bound to this action. Native Google verification is intentionally unavailable.</p>
    </form> : null}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()}>Refresh status</button>
  </section>;
}

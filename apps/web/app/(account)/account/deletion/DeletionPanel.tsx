"use client";

import { FormEvent, useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { apiBaseUrl } from "@/lib/api/config";
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

type AcceptedOutcome = "confirmed" | "unknown";
type GoogleGrant = { action: DeletionAction; token: string };

export function DeletionPanel({ requestEnabled }: { requestEnabled: boolean }) {
  const { user, isPending } = useSession();
  const [status, setStatus] = useState<AccountDeletionStatus | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [googleGrant, setGoogleGrant] = useState<GoogleGrant>();
  const [accepted, setAccepted] = useState<AcceptedOutcome>();
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
  useEffect(() => {
    const expectedOrigin = new URL(apiBaseUrl ?? window.location.origin).origin;
    const receive = (event: MessageEvent<unknown>) => {
      if (event.origin !== expectedOrigin || !event.data || typeof event.data !== "object") return;
      const grant = event.data as { type?: unknown; action?: unknown; token?: unknown };
      if (grant.type !== "dayli.account-management-grant"
        || (grant.action !== "request_deletion" && grant.action !== "cancel_deletion")
        || typeof grant.token !== "string" || !/^[0-9a-f]{64}$/.test(grant.token)) return;
      setGoogleGrant({ action: grant.action, token: grant.token });
      setPassword("");
      setBusy(false);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  const finishAccepted = async (outcome: AcceptedOutcome) => {
    setAccepted(outcome);
    // The command revokes the current server session. Clear the browser cookie
    // too, even when the server has already removed that session.
    await authClient.signOut().catch(() => undefined);
  };

  if (accepted) return <section aria-label="Account deletion" className="space-y-3 rounded-lg border border-red-500/30 p-4">
    <h2 className="text-sm font-medium">Account deletion request</h2>
    <p role="status">{accepted === "confirmed"
      ? "Your request was accepted. You have been signed out. Sign in again to view its current status or cancel if the server still allows it."
      : "We could not confirm the request response. You have been signed out because the request may have been accepted. Sign in again to check its server status before taking another action."}</p>
  </section>;
  if (isPending) return <p>Checking your session…</p>;
  if (!user) return <p>Sign in to manage account deletion.</p>;

  const pending = status?.state === "pending_deletion";
  const action: DeletionAction = pending ? "cancel_deletion" : "request_deletion";
  const usableGoogleGrant = googleGrant?.action === action ? googleGrant.token : undefined;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || (!usableGoogleGrant && !password) || (!pending && !confirmed) || (!pending && !requestEnabled)) return;
    setBusy(true);
    setError(undefined);
    let requestSent = false;
    try {
      const token = usableGoogleGrant ?? await proveDeletionWithPassword(action, password);
      if (pending) {
        await cancelDeletion(token);
        setGoogleGrant(undefined);
        setPassword("");
        await refresh();
      } else {
        requestSent = true;
        await requestDeletion(token, deletionIdempotencyKey());
        await finishAccepted("confirmed");
      }
      setConfirmed(false);
    } catch (reason) {
      if (requestSent) {
        await finishAccepted("unknown");
      } else {
        setError(reason instanceof Error && reason.message === "google-required"
          ? "This account requires fresh Google verification."
          : pending ? "Deletion could not be cancelled. Try again later." : "Deletion could not be requested. Try again later.");
      }
    } finally { setBusy(false); }
  };
  const startGoogle = async () => {
    if (busy || (!pending && (!requestEnabled || !confirmed))) return;
    const popup = window.open("about:blank", "dayli-account-deletion-proof", "popup,width=520,height=680");
    if (!popup) {
      setError("Allow popups to verify with Google.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try { popup.location.assign(await beginGoogleDeletionProof(action)); }
    catch {
      popup.close();
      setError("Google verification is unavailable. Try another sign-in method or try again later.");
      setBusy(false);
    }
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
        <input aria-label="Current password" required={!usableGoogleGrant} disabled={Boolean(usableGoogleGrant)} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded border border-foreground/20 bg-transparent px-3 py-2" />
      </label>
      {usableGoogleGrant && <p role="status">Google verification complete. Submit to continue.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || (!pending && !confirmed)}>{busy ? "Working…" : pending ? "Cancel deletion" : "Request deletion"}</button>
        <button type="button" disabled={busy || (!pending && !confirmed)} onClick={() => void startGoogle()}>Verify with Google instead</button>
      </div>
      <p className="text-xs text-foreground/60">Google verification opens in a popup. Its single-use action grant is sent back without entering a URL. Native Google verification is intentionally unavailable.</p>
    </form> : null}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={busy} onClick={() => void refresh()}>Refresh status</button>
  </section>;
}

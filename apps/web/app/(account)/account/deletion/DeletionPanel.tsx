"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
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
type ExpectedGooglePopup = { popup: Window; action: DeletionAction };
const popupTimeoutMs = 120_000;

function popupName(): string {
  return `dayli-account-deletion-proof-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export function DeletionPanel({ requestEnabled }: { requestEnabled: boolean }) {
  const { user, isPending } = useSession();
  const [status, setStatus] = useState<AccountDeletionStatus | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [password, setPassword] = useState("");
  const [googleGrant, setGoogleGrant] = useState<GoogleGrant>();
  const [accepted, setAccepted] = useState<AcceptedOutcome>();
  const expectedGooglePopup = useRef<ExpectedGooglePopup | undefined>(undefined);
  const popupMonitor = useRef<number | undefined>(undefined);
  const popupTimeout = useRef<number | undefined>(undefined);
  const userId = user?.id;

  const stopPopupMonitor = () => {
    if (popupMonitor.current !== undefined) window.clearInterval(popupMonitor.current);
    if (popupTimeout.current !== undefined) window.clearTimeout(popupTimeout.current);
    popupMonitor.current = undefined;
    popupTimeout.current = undefined;
  };

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
      const expected = expectedGooglePopup.current;
      if (event.origin !== expectedOrigin || event.source !== expected?.popup || !event.data || typeof event.data !== "object") return;
      const message = event.data as { type?: unknown; action?: unknown; token?: unknown };
      if (message.action !== expected.action) return;
      if (message.type === "dayli.account-management-proof-failure") {
        stopPopupMonitor();
        expectedGooglePopup.current = undefined;
        expected.popup.close();
        setBusy(false);
        setError("Google verification did not complete. Try again to open a new verification window.");
        return;
      }
      if (message.type !== "dayli.account-management-grant" || typeof message.token !== "string" || !/^[0-9a-f]{64}$/.test(message.token)) return;
      stopPopupMonitor();
      expectedGooglePopup.current = undefined;
      expected.popup.close();
      setGoogleGrant({ action: expected.action, token: message.token });
      setPassword("");
      setBusy(false);
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      stopPopupMonitor();
      expectedGooglePopup.current?.popup.close();
      expectedGooglePopup.current = undefined;
    };
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
      if (usableGoogleGrant) setGoogleGrant(undefined);
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
    stopPopupMonitor();
    expectedGooglePopup.current?.popup.close();
    expectedGooglePopup.current = undefined;
    const popup = window.open("about:blank", popupName(), "popup,width=520,height=680");
    if (!popup) {
      setError("Allow popups to verify with Google.");
      return;
    }
    expectedGooglePopup.current = { popup, action };
    popupMonitor.current = window.setInterval(() => {
      if (expectedGooglePopup.current?.popup !== popup || !popup.closed) return;
      stopPopupMonitor();
      expectedGooglePopup.current = undefined;
      setBusy(false);
      setError("Google verification was closed. Try again to open a new verification window.");
    }, 250);
    popupTimeout.current = window.setTimeout(() => {
      if (expectedGooglePopup.current?.popup !== popup) return;
      stopPopupMonitor();
      expectedGooglePopup.current = undefined;
      popup.close();
      setBusy(false);
      setError("Google verification timed out. Try again to open a new verification window.");
    }, popupTimeoutMs);
    setBusy(true);
    setError(undefined);
    try {
      const authorizationUrl = await beginGoogleDeletionProof(action);
      if (expectedGooglePopup.current?.popup !== popup) return;
      popup.location.assign(authorizationUrl);
    } catch {
      if (expectedGooglePopup.current?.popup !== popup) return;
      stopPopupMonitor();
      expectedGooglePopup.current = undefined;
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

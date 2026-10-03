"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session/hooks";
import { accountExportDownloadUrl, getAccountExportStatus, requestAccountExport,
  type AccountExportStatus } from "@/lib/export/account-export";

export function ExportPanel({ enabled }: { enabled: boolean }) {
  const { user, isPending } = useSession();
  const userId = user?.id;
  const [status, setStatus] = useState<AccountExportStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!enabled || !userId) return;
    let active = true;
    void getAccountExportStatus().then((next) => { if (active) setStatus(next); })
      .catch(() => { if (active) setError("Export status is unavailable. Try again later."); });
    return () => { active = false; };
  }, [enabled, userId]);
  if (!enabled) return <p>Account exports are not available yet.</p>;
  if (isPending) return <p>Checking your session…</p>;
  if (!user) return <p>Sign in to request an export.</p>;

  const refresh = async () => {
    setError(undefined);
    setBusy(true);
    try { setStatus(await getAccountExportStatus()); }
    catch { setError("Export status is unavailable. Try again later."); }
    finally { setBusy(false); }
  };
  const request = async () => {
    setError(undefined);
    setBusy(true);
    try { await requestAccountExport(); setStatus(await getAccountExportStatus()); }
    catch { setError("Export could not be requested. Try again later."); }
    finally { setBusy(false); }
  };
  const canRequest = !status || ["none", "failed", "cancelled", "expired"].includes(status.status);
  return <section className="space-y-3" aria-label="Account export">
    <p>Your ZIP includes approved account records and restorable Trash. It does not extend a deletion deadline.</p>
    {status && <p role="status">Status: {status.status.replaceAll("_", " ")}</p>}
    {status?.status === "ready" && status.requestId && status.expiresAt && <>
      <a className="underline" href={accountExportDownloadUrl(status.requestId)}>Download ZIP</a>
      <p>Available until {new Date(status.expiresAt).toLocaleString()}.</p>
    </>}
    {error && <p role="alert">{error}</p>}
    {canRequest && <button type="button" disabled={busy} onClick={() => void request()}>Request export</button>}
    <button type="button" disabled={busy} onClick={() => void refresh()}>Refresh status</button>
  </section>;
}

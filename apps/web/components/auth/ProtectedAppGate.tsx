"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAccountAccess } from "@/lib/account/access-provider";
import { authClient } from "@/lib/auth/client";
import { useSession } from "@/lib/session/hooks";

/** Ordinary app access only. Account-management routes retain their own policy. */
export function ProtectedAppGate({ children }: { children: React.ReactNode }) {
  const { user, isPending, refresh } = useSession();
  const { snapshot, retry } = useAccountAccess();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const returnTo = `${pathname}${search ? `?${search}` : ""}`;
  const signedOut = !isPending && (!user || snapshot.state === "unauthenticated");
  const legalRequired = snapshot.state === "ready" && snapshot.value.onboarding.legalAcceptanceRequired;
  const usernameRequired = snapshot.state === "ready" && snapshot.value.restriction === "active" && snapshot.value.onboarding.usernameSetupRequired;

  useEffect(() => {
    if (signedOut) {
      if (user) void refresh().catch(() => {});
      router.replace(`/sign-in?next=${encodeURIComponent(returnTo)}`);
    } else if (!isPending && user && legalRequired) router.replace("/legal/acceptance");
    else if (!isPending && user && usernameRequired) router.replace("/setup-username");
  }, [isPending, legalRequired, refresh, returnTo, router, signedOut, user, usernameRequired]);

  if (isPending || !user || signedOut || legalRequired || usernameRequired) return null;
  if (snapshot.state === "pending") return <p role="status" className="p-6">Checking account access...</p>;
  if (snapshot.state === "unavailable") return <main className="space-y-4 p-6">
    <p role="alert">Account access could not be verified.</p>
    <button type="button" onClick={() => void retry()}>Try again</button>
  </main>;
  if (snapshot.state !== "ready") return null;
  if (snapshot.value.restriction !== "active" || !snapshot.value.allowed.includes("ordinary")) return <main className="space-y-4 p-6">
    <h1>Account access is restricted</h1>
    {snapshot.value.allowed.includes("export") && <p><Link href="/account/export">Your data export</Link></p>}
    {snapshot.value.allowed.includes("cancel_deletion_verification") && <p><Link href="/account/deletion">Manage account deletion</Link></p>}
    <button type="button" onClick={() => void authClient.signOut()}>Sign out</button>
  </main>;
  return children;
}

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LegalAcceptanceError, readAccountPolicy } from "@/lib/legal/acceptance";
import { useSession } from "@/lib/session/hooks";

/** Checks initial access before mounting, then revalidates navigation in the background.
 * The API enforces current account policy on each protected request.
 */
export function LegalAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  return <AccountLegalAcceptanceGate key={user?.id ?? "signed-out"}>{children}</AccountLegalAcceptanceGate>;
}

function AccountLegalAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { user, isPending, refresh } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();
  const returnTo = `${pathname}${search ? `?${search}` : ""}`;
  const userId = user?.id;
  const [checkedUserId, setCheckedUserId] = useState<string>();

  useEffect(() => {
    let active = true;
    if (isPending) return;
    if (!userId) {
      router.replace(`/sign-in?next=${encodeURIComponent(returnTo)}`);
      return;
    }
    void readAccountPolicy().then((policy) => {
      if (!active) return;
      if (policy.restriction === "terms_blocked" || policy.restriction === "age_declaration_blocked") {
        setCheckedUserId(undefined);
        router.replace("/legal/acceptance");
        return;
      }
      setCheckedUserId(userId);
    }).catch(async (reason: unknown) => {
      if (!active) return;
      setCheckedUserId(undefined);
      if (reason instanceof LegalAcceptanceError && reason.status === 401) {
        await refresh().catch(() => {});
        if (active) router.replace(`/sign-in?next=${encodeURIComponent(returnTo)}`);
      } else {
        router.replace("/legal/acceptance?status=unavailable");
      }
    });
    return () => { active = false; };
  }, [isPending, refresh, returnTo, router, userId]);

  return !isPending && userId && checkedUserId === userId ? children : null;
}

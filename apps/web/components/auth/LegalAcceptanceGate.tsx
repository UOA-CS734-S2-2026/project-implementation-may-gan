"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LegalAcceptanceError, readAccountPolicy } from "@/lib/legal/acceptance";
import { useSession } from "@/lib/session/hooks";

/** Stops the ordinary app before any blocked-account data request is made. */
export function LegalAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { user, isPending, refresh } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();
  const returnTo = `${pathname}${search ? `?${search}` : ""}`;
  const [checked, setChecked] = useState<{ userId: string; route: string }>();

  useEffect(() => {
    let active = true;
    if (isPending) return;
    if (!user) {
      router.replace(`/sign-in?next=${encodeURIComponent(returnTo)}`);
      return;
    }
    void readAccountPolicy().then((policy) => {
      if (!active) return;
      if (policy.restriction === "terms_blocked" || policy.restriction === "age_declaration_blocked") {
        router.replace("/legal/acceptance");
        return;
      }
      setChecked({ userId: user.id, route: returnTo });
    }).catch(async (reason: unknown) => {
      if (!active) return;
      if (reason instanceof LegalAcceptanceError && reason.status === 401) {
        await refresh().catch(() => {});
        if (active) router.replace(`/sign-in?next=${encodeURIComponent(returnTo)}`);
      } else {
        router.replace("/legal/acceptance?status=unavailable");
      }
    });
    return () => { active = false; };
  }, [isPending, refresh, returnTo, router, user]);

  return user && checked?.userId === user.id && checked.route === returnTo ? children : null;
}

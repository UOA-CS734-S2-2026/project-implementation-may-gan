"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readAccountPolicy } from "@/lib/legal/acceptance";
import { useSession } from "@/lib/session/hooks";

/** Stops the ordinary app before any blocked-account data request is made. */
export function LegalAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checkedUserId, setCheckedUserId] = useState<string>();

  useEffect(() => {
    let active = true;
    if (isPending) return;
    if (!user) {
      const search = searchParams.toString();
      const returnTo = `${pathname}${search ? `?${search}` : ""}`;
      router.replace(`/sign-in?next=${encodeURIComponent(returnTo)}`);
      return;
    }
    void readAccountPolicy().then((policy) => {
      if (!active) return;
      if (policy.restriction === "terms_blocked" || policy.restriction === "age_declaration_blocked") {
        router.replace("/legal/acceptance");
        return;
      }
      setCheckedUserId(user.id);
    }).catch(() => {
      if (active) router.replace("/legal/acceptance?status=unavailable");
    });
    return () => { active = false; };
  }, [isPending, pathname, router, searchParams, user]);

  return user && checkedUserId === user.id ? children : null;
}

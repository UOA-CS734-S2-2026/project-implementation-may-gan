"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { readAccountPolicy } from "@/lib/legal/acceptance";
import { useSession } from "@/lib/session/hooks";

/** Stops the ordinary app before any blocked-account data request is made. */
export function LegalAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [checkedUserId, setCheckedUserId] = useState<string>();

  useEffect(() => {
    let active = true;
    if (isPending) return;
    if (!user) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
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
  }, [isPending, pathname, router, user]);

  return user && checkedUserId === user.id ? children : null;
}

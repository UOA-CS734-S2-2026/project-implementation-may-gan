"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { getUsernameProfile } from "@/lib/profile/username";

/** Keeps authenticated application routes unavailable until a public handle exists. */
export function UsernameSetupGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let current = true;
    if (isPending) return;
    if (!user) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setReady(false);
    void getUsernameProfile().then((profile) => {
      if (!current) return;
      if (profile.needsUsernameSetup) router.replace("/setup-username");
      else setReady(true);
    }).catch(() => {
      if (current) router.replace("/sign-in");
    });
    return () => { current = false; };
  }, [isPending, pathname, router, user]);

  return ready ? children : null;
}

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { getUsernameProfile } from "@/lib/profile/username";

/** Keeps authenticated application routes unavailable until a public handle exists. */
export function UsernameSetupGate({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  return <AccountUsernameSetupGate key={user?.id ?? "signed-out"}>{children}</AccountUsernameSetupGate>;
}

function AccountUsernameSetupGate({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const returnTo = `${pathname}${search ? `?${search}` : ""}`;
  const userId = user?.id;
  const [readyUserId, setReadyUserId] = useState<string>();

  useEffect(() => {
    let current = true;
    if (isPending) return;
    if (!userId) {
      router.replace(`/sign-in?next=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (readyUserId === userId) return;
    void getUsernameProfile().then((profile) => {
      if (!current) return;
      if (profile.needsUsernameSetup) router.replace("/setup-username");
      else setReadyUserId(userId);
    }).catch(() => {
      if (current) router.replace("/sign-in");
    });
    return () => { current = false; };
  }, [isPending, readyUserId, returnTo, router, userId]);

  return !isPending && userId && readyUserId === userId ? children : null;
}

"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getUsernameProfile } from "@/lib/profile/username";
import { useSession } from "@/lib/session/hooks";
import { publicActionTarget, resumePublicIntent } from "@/lib/routing/public-return-intent";

/** New Google accounts finish username setup before an authenticated action can be resumed. */
export function PublicIntentUsernameGate() {
  const { user, isPending } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const target = publicActionTarget(`${pathname}${searchParams.size ? `?${searchParams}` : ""}`);

  useEffect(() => {
    if (isPending || !user || !target || !resumePublicIntent(target, user.id)) return;
    let current = true;
    void getUsernameProfile().then((profile) => {
      if (current && profile.needsUsernameSetup) router.replace(`/setup-username?next=${encodeURIComponent(target)}`);
    }).catch(() => undefined);
    return () => { current = false; };
  }, [isPending, router, target, user]);

  return null;
}

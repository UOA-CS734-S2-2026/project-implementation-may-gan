"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { useSession } from "@/lib/session/hooks";
import { Button } from "@/components/ui/core/Button";

export function SignOutButton() {
  const router = useRouter();
  const { refresh } = useSession();

  async function handleSignOut() {
    await authClient.signOut();
    // Better Auth's mutation does not reliably invalidate every mounted
    // useSession store. Refetch before navigation so a protected route cannot
    // reuse the just-revoked identity from the client cache.
    await refresh();
    router.replace("/");
  }

  return (
    <Button onClick={handleSignOut} variant={{ weight: "secondary" }}>
      Sign out
    </Button>
  );
}

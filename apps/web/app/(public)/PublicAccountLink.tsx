"use client";

import { Button } from "@/components/ui/core/Button";
import { useSession } from "@/lib/session/hooks";

export function PublicAccountLink() {
  const { user, isPending } = useSession();
  if (isPending) return <span className="h-9 w-20" aria-hidden />;
  return (
    <Button
      href={user ? "/home" : "/sign-in"}
      variant={{ weight: "secondary", color: "accent", size: "sm" }}
    >
      {user ? "Open Dayli" : "Sign in"}
    </Button>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { ThemeMenu } from "@/components/theme/ThemeMenu";
import { SignOutButton } from "./_components/SignOutButton";

// Username and profile visibility return with the profile API (#68).
export default function SettingsPage() {
  const router = useRouter();
  const { user, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !user) router.replace("/sign-in");
  }, [isPending, router, user]);

  if (isPending || !user) return null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-foreground/60">Your account details.</p>
        </div>

        <div className="space-y-3 rounded-lg border border-foreground/10 p-4">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
        </div>

        <div className="flex items-center justify-between">
          <ThemeMenu />
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground/60">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

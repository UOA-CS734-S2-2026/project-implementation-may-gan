"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { SignOutButton } from "./_components/SignOutButton";
import { ProfileVisibilityToggle } from "./_components/ProfileVisibilityToggle";

export default function SettingsPage() {
  const router = useRouter();
  const { user, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !user) router.replace("/sign-in");
  }, [isPending, router, user]);

  if (isPending || !user) return null;

  // Usernames and profile visibility arrive with the profile API (#68).
  const visibility = "public" as const;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-foreground/60">Your account details.</p>
        </div>

        <div className="space-y-3 rounded-lg border border-foreground/10 p-4">
          <Row label="Username" value="not set yet" />
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          {/* Paid features — hidden until billing is wired up */}
          {/* <Row label="Plan" value={user.tier ?? "free"} /> */}
          {/* <Row label="Role" value={user.role ?? "user"} /> */}
        </div>

        <ProfileVisibilityToggle initialVisibility={visibility} />

        {/* Paid features — hidden until billing is wired up */}
        {/* <ProfileGateDemo /> */}

        <SignOutButton />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground/60">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}

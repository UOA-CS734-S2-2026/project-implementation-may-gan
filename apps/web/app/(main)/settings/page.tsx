"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { SignOutButton } from "./_components/SignOutButton";
import { ProfileVisibilityToggle } from "./_components/ProfileVisibilityToggle";
import { LinkGoogleAccount } from "./_components/LinkGoogleAccount";
import { LegalDraftNotice, LegalLinks } from "@/components/legal/LegalLinks";

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

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Sign-in methods</h2>
          <p className="text-xs text-foreground/60">Google is connected only when you choose it here. Matching emails are never connected automatically.</p>
          <LinkGoogleAccount />
        </section>

        <section className="space-y-2 rounded-lg border border-foreground/10 p-4">
          <h2 className="text-sm font-medium">Legal</h2>
          <LegalLinks className="text-sm text-foreground-secondary" />
          <LegalDraftNotice />
        </section>

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

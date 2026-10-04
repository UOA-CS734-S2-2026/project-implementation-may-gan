"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { SignOutButton } from "./_components/SignOutButton";
import { ProfileVisibilityToggle } from "./_components/ProfileVisibilityToggle";
import { LinkGoogleAccount } from "./_components/LinkGoogleAccount";
import { getUsernameProfile } from "@/lib/profile/username";
import { useProfileDetailsQuery } from "@/features/profiles/get-profile-details/use-profile-details-query";
import { EditProfileForm } from "@/features/profiles/update-profile/EditProfileForm";
import { AvatarForm } from "@/features/profiles/update-profile/AvatarForm";
import { ChangeUsernameForm } from "@/features/profiles/change-username/ChangeUsernameForm";
import { LegalDraftNotice, LegalLinks } from "@/components/legal/LegalLinks";
import { Skeleton } from "@/components/ui/core/Skeleton";
import { TrashPanel } from "@/features/posts/trash/TrashPanel";

export default function SettingsPage() {
  const router = useRouter();
  const { user, session, isPending } = useSession();
  const [username, setUsername] = useState<string>();

  useEffect(() => {
    if (!isPending && !user) router.replace("/sign-in");
  }, [isPending, router, user]);

  useEffect(() => {
    if (!user) return;
    void getUsernameProfile().then((profile) => setUsername(profile.username ?? undefined));
  }, [user]);
  const profile = useProfileDetailsQuery(username);
  const authorizedProfile = profile.data?.kind === "authorized" ? profile.data : undefined;

  if (isPending || !user) return null;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-foreground/60">Your account details.</p>
        </div>

        <div className="space-y-3 rounded-2xl bg-background p-5 shadow-card">
          <Row label="Name" value={user.name} />
          <Row label="Email" value={user.email} />
          {/* Paid features — hidden until billing is wired up */}
          {/* <Row label="Plan" value={user.tier ?? "free"} /> */}
          {/* <Row label="Role" value={user.role ?? "user"} /> */}
        </div>

        {authorizedProfile?.owner ? (
          <>
            {/* Keyed so the forms start from the saved values after each change. */}
            <AvatarForm profile={authorizedProfile} />
            <EditProfileForm key={[authorizedProfile.displayName, authorizedProfile.bio, authorizedProfile.mbti, authorizedProfile.whatIDo, authorizedProfile.listeningTo].join("|")} profile={authorizedProfile} />
            <ChangeUsernameForm key={authorizedProfile.username} profile={authorizedProfile} />
            <ProfileVisibilityToggle visibility={authorizedProfile.owner.profileVisibility} />
          </>
        ) : profile.isError ? (
          <p className="text-sm text-foreground/60">Your profile couldn&apos;t be loaded.</p>
        ) : (
          <ProfileSkeleton />
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Sign-in methods</h2>
          <p className="text-xs text-foreground/60">Google is connected only when you choose it here. Matching emails are never connected automatically.</p>
          <LinkGoogleAccount />
        </section>

        <TrashPanel key={`${user.id}:${session?.id ?? "no-session"}`} actorId={user.id} />

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

function ProfileSkeleton() {
  return <div role="status" aria-label="Loading profile" className="space-y-4 rounded-2xl bg-background p-5 shadow-card"><div className="flex items-center gap-3"><Skeleton className="h-16 w-16 rounded-full" /><div className="space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-24" /></div></div><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-full rounded-lg" /></div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground/60">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}

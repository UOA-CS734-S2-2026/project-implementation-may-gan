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

export default function SettingsPage() {
  const router = useRouter();
  const { user, isPending } = useSession();
  const [username, setUsername] = useState<string>();

  useEffect(() => {
    if (!isPending && !user) router.replace("/sign-in");
  }, [isPending, router, user]);

  useEffect(() => {
    if (!user) return;
    void getUsernameProfile().then((profile) => setUsername(profile.username ?? undefined));
  }, [user]);
  const profile = useProfileDetailsQuery(username);

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

        {profile.data?.owner ? (
          <>
            {/* Keyed so the forms start from the saved values after each change. */}
            <AvatarForm profile={profile.data} />
            <EditProfileForm key={[profile.data.displayName, profile.data.bio, profile.data.mbti, profile.data.whatIDo, profile.data.listeningTo].join("|")} profile={profile.data} />
            <ChangeUsernameForm key={profile.data.username} profile={profile.data} />
            <ProfileVisibilityToggle visibility={profile.data.owner.profileVisibility} />
          </>
        ) : (
          <p className="text-sm text-foreground/60">{profile.isError ? "Your profile couldn't be loaded." : "Loading your profile…"}</p>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Sign-in methods</h2>
          <p className="text-xs text-foreground/60">Google is connected only when you choose it here. Matching emails are never connected automatically.</p>
          <LinkGoogleAccount />
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

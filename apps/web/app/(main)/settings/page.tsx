import { redirect } from "next/navigation";
import { trpcServer } from "@/lib/trpc/server";
import { SignOutButton } from "./_components/SignOutButton";
import { ProfileVisibilityToggle } from "./_components/ProfileVisibilityToggle";

export default async function SettingsPage() {
  const user = await trpcServer.auth.me().catch(() => null);

  if (!user) redirect("/sign-in");

  const visibility =
    (user.profileVisibility as "public" | "private") ?? "public";

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-foreground/60">Your account details.</p>
        </div>

        <div className="space-y-3 rounded-lg border border-foreground/10 p-4">
          <Row label="Username" value={`@${user.username}`} />
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

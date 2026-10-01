import "server-only";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { browserProxyEnabled } from "@/lib/api/config";
import { browserApiTransport } from "@/lib/api/server/transport";
import { requireUsernameReady } from "@/lib/session/guards";

export async function ServerUsernameGuard({
  children,
  returnTo,
  allowUsernameSetup = false,
}: {
  children: React.ReactNode;
  returnTo: string;
  allowUsernameSetup?: boolean;
}) {
  if (!browserProxyEnabled) return children;
  const guard = await requireUsernameReady(await headers(), await browserApiTransport(), returnTo);
  if (guard.state === "redirect") redirect(guard.location);
  if (guard.state === "ready" && allowUsernameSetup) redirect("/home");
  if (guard.state === "needs-username" && !allowUsernameSetup) redirect("/setup-username");
  return children;
}

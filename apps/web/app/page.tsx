import { redirect } from "next/navigation";
import { browserProxyEnabled } from "@/lib/api/config";
import { browserApiTransport } from "@/lib/api/server/transport";
import { resolveLanding } from "@/lib/session/guards";
import LandingPage from "@/components/landing/LandingPage";
import { headers } from "next/headers";

/** Server guards are opt-in. Direct API cookie deployments retain the existing client flow. */
export default async function App() {
  if (browserProxyEnabled) {
    const guard = await resolveLanding(await headers(), await browserApiTransport());
    if (guard.state === "redirect") redirect(guard.location);
  }
  return <LandingPage />;
}

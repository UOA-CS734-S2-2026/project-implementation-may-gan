import ClientPage from "./ClientPage";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  return <ServerUsernameGuard returnTo={routeReturnPath("/settings", await searchParams)}><ClientPage /></ServerUsernameGuard>;
}

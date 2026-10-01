import ClientPage from "./ClientPage";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<RouteSearchParams> }) {
  const { username } = await params;
  return <ServerUsernameGuard returnTo={routeReturnPath(`/u/${encodeURIComponent(username)}`, await searchParams)}><ClientPage params={Promise.resolve({ username })} /></ServerUsernameGuard>;
}

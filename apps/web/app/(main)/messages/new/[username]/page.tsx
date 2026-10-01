import ClientPage from "./ClientPage";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export default async function NewMessagePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<RouteSearchParams> }) {
  const { username } = await params;
  const returnTo = routeReturnPath(`/messages/new/${encodeURIComponent(username)}`, await searchParams);
  return <ServerUsernameGuard returnTo={returnTo}><ClientPage params={Promise.resolve({ username })} /></ServerUsernameGuard>;
}

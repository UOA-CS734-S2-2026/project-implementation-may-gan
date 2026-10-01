import ClientPage from "./ClientPage";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export default async function PostPage({ params, searchParams }: { params: Promise<{ username: string; postId: string }>; searchParams: Promise<RouteSearchParams> }) {
  const { username, postId } = await params;
  const path = `/u/${encodeURIComponent(username)}/${encodeURIComponent(postId)}`;
  return <ServerUsernameGuard returnTo={routeReturnPath(path, await searchParams)}><ClientPage /></ServerUsernameGuard>;
}

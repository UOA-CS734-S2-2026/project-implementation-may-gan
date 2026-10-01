import ClientPage from "./ClientPage";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export default async function PostPage({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  return <ServerUsernameGuard returnTo={routeReturnPath("/post", await searchParams)}><ClientPage /></ServerUsernameGuard>;
}

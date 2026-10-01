import { Feed } from "@/features/feed/list-feed/Feed";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  const returnTo = routeReturnPath("/home", await searchParams);
  return <ServerUsernameGuard returnTo={returnTo}>
    <section className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-12">
      <Feed />
    </section>
  </ServerUsernameGuard>;
}

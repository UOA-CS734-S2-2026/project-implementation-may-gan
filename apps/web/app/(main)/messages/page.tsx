import { Inbox } from "@/features/messaging/inbox/Inbox";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  return <ServerUsernameGuard returnTo={routeReturnPath("/messages", await searchParams)}><Inbox /></ServerUsernameGuard>;
}

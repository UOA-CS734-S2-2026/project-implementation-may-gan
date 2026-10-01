import ClientPage from "./ClientPage";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export default async function NewConversationPickerPage({ searchParams }: { searchParams: Promise<RouteSearchParams> }) {
  return <ServerUsernameGuard returnTo={routeReturnPath("/messages/new", await searchParams)}><ClientPage /></ServerUsernameGuard>;
}

import { Conversation } from "@/features/messaging/conversation/Conversation";
import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const { id } = await params;
  const path = `/messages/${encodeURIComponent(id)}`;
  return <ServerUsernameGuard returnTo={routeReturnPath(path, await searchParams)}><Conversation conversationId={id} /></ServerUsernameGuard>;
}

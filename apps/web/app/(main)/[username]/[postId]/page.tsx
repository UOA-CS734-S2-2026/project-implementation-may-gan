import { redirect } from "next/navigation";
import { routeReturnPath, type RouteSearchParams } from "@/lib/routing/route-return-path";

/** Legacy public alias. The canonical protected route applies its own guard. */
export default async function LegacyPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; postId: string }>;
  searchParams: Promise<RouteSearchParams>;
}) {
  const { username, postId } = await params;
  const canonical = `/u/${encodeURIComponent(username)}/${encodeURIComponent(postId)}`;
  redirect(routeReturnPath(canonical, await searchParams));
}

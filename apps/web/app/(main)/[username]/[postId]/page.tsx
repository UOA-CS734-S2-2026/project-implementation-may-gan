import { redirect } from "next/navigation";

export default async function LegacyPostPage({
  params,
}: {
  params: Promise<{ username: string; postId: string }>;
}) {
  const { username, postId } = await params;
  redirect(`/u/${encodeURIComponent(username)}/${encodeURIComponent(postId)}`);
}

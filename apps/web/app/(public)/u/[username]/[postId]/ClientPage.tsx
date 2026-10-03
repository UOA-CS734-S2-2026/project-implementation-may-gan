"use client";

import { useParams } from "next/navigation";
import { PostDetailView } from "@/features/posts/get-post/PostDetailView";

export default function PostPage() {
  const { username, postId } = useParams<{ username: string; postId: string }>();
  return (
    <section className="flex-1 w-full px-4 md:px-6 py-12">
      <PostDetailView username={decodeURIComponent(username)} postId={decodeURIComponent(postId)} />
    </section>
  );
}

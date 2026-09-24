"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PostForm from "./_components/PostForm";
import { trpc } from "@/lib/trpc/client";
import { useSession } from "@/lib/session/hooks";
import { PostDeadlineCountdown } from "@/components/ui/PostDeadlineCountdown";

export default function PostPage() {
  const router = useRouter();
  const { user, isPending } = useSession();

  const { data: existingPost, isLoading } = trpc.posts.getPostForToday.useQuery(
    {},
    {
      enabled: !!user,
    }
  );

  useEffect(() => {
    if (isPending) {
      return;
    }

    if (!user) {
      router.replace("/sign-in");
    }
  }, [isPending, router, user]);

  const mode = existingPost ? "edit" : "create";
  const postData = existingPost
    ? {
        promptResponse: existingPost.promptResponse,
        dayRating: existingPost.dayRating,
        caption: existingPost.caption ?? undefined,
        media: existingPost.media,
      }
    : undefined;

  if (isPending || !user || isLoading) {
    return null;
  }

  const title = mode === "edit" ? "Edit your Dayli" : "Post your Dayli!";
  const subtitle =
    mode === "edit" ? "Update your post for today" : "Share how your day was";

  return (
    <div className="space-y-6 px-10 py-20 md:p-44 flex flex-row">
      <div className="w-165 mx-auto">
        <div className="flex justify-between items-start gap-4 pb-8">
          <div className="space-y-2 text-left ml-2">
            <h1 className="text-4xl font-semibold font-serif tracking-tighter">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-foreground-secondary">{subtitle}</p>
            )}
          </div>
          <PostDeadlineCountdown />
        </div>

        <PostForm
          mode={mode}
          postId={existingPost?.id}
          initialData={postData}
        />
      </div>
    </div>
  );
}

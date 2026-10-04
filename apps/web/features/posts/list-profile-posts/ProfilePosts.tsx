"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PostCard } from "@/components/ui/PostCard";
import { Button } from "@/components/ui/core/Button";
import type { ProfilePost } from "@/features/posts/shared/posts.api";
import { PostApiError } from "@/features/posts/shared/query-result";
import { useProfilePostsQuery } from "./use-profile-posts-query";

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full place-items-center py-24 text-center">
      <div className="text-lg text-foreground-secondary font-serif tracking-tight font-medium">
        {children}
      </div>
    </div>
  );
}

/** Only the author sees solo and unreleased posts, so only they need the label. */
function labelFor(post: ProfilePost) {
  if (!post.released) return "Not released yet";
  if (post.audience === "solo") return "Only you";
  return undefined;
}

/**
 * The posts on a profile, newest day first. The API decides what the viewer
 * may see; this only chooses the wording for an empty page.
 */
export function ProfilePosts({ username, displayName, isMe }: { username: string; displayName: string; isMe: boolean }) {
  const router = useRouter();
  const query = useProfilePostsQuery(username);

  const unauthenticated = query.error instanceof PostApiError && query.error.failure === "unauthenticated";
  useEffect(() => {
    if (unauthenticated) router.replace("/sign-in");
  }, [unauthenticated, router]);

  const posts = useMemo(() => {
    const seen = new Map<string, ProfilePost>();
    for (const page of query.data?.pages ?? []) {
      if (page.kind === "restricted") continue;
      for (const post of page.items) if (!seen.has(post.id)) seen.set(post.id, post);
    }
    return [...seen.values()];
  }, [query.data]);

  if (query.isPending) {
    return (
      <Message>
        <p role="status">Loading daylies...</p>
      </Message>
    );
  }

  const restricted = query.data?.pages.some((page) => page.kind === "restricted") ?? false;
  if (restricted) return null;

  if (query.isError && posts.length === 0) {
    return (
      <Message>
        <p role="alert" className="mb-4">
          {query.error instanceof PostApiError && query.error.failure === "network"
            ? "You seem to be offline. Check your connection and try again."
            : "These daylies couldn't be loaded right now."}
        </p>
        <Button
          onClick={() => void query.refetch()}
          variant={{ color: "accent", size: "sm", weight: "secondary" }}
        >
          Try again
        </Button>
      </Message>
    );
  }

  if (posts.length === 0) {
    return (
      <Message>
        <p>
          {isMe
            ? "You haven't posted a dayli yet. Your daylies will be kept here."
            : `${displayName} hasn't shared any daylies with you yet.`}
        </p>
      </Message>
    );
  }

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            postId={post.id}
            username={post.author.username}
            displayName={post.author.displayName}
            prompt={post.prompt.text}
            promptResponse={post.reflectiveAnswer}
            createdAt={post.acceptedAt}
            media={post.media[0] ?? null}
            label={labelFor(post)}
            likeCount={post.likeCount}
            viewerHasLiked={post.viewerHasLiked}
            commentCount={post.commentCount}
          />
        ))}
      </div>

      {(query.hasNextPage || query.isFetchNextPageError) && (
        <div className="flex flex-col items-center gap-2">
          {query.isFetchNextPageError && (
            <p role="alert" className="text-sm text-red-500">
              More daylies couldn&apos;t be loaded. Try again.
            </p>
          )}
          <Button
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            variant={{ color: "accent", size: "sm", weight: "secondary" }}
          >
            {query.isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

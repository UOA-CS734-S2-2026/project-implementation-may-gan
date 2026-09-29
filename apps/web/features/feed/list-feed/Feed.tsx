"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PostCard } from "@/components/ui/PostCard";
import { Button } from "@/components/ui/core/Button";
import type { FeedPost } from "@/features/feed/shared/feed.api";
import { FeedApiError } from "@/features/feed/shared/query-result";
import { useFeedQuery } from "./use-feed-query";

const EMPTY_MESSAGES = [
  "No daylies from your friends yesterday... maybe today's the comeback?",
  "Nobody posted anything yesterday... how about today?",
  "There was radio silence yesterday... maybe we'll get some daylies today?",
  "The archive is looking a bit thin for yesterday. There's always today.",
  "Yesterday's daylies are looking a little light. Maybe everyone was busy?",
  "Silence is golden, but a dayli is better. Let's write today.",
  "Well, nothing yesterday. The bar for today's dayli is on the floor - it's on you!",
  "No posts from yesterday. How boring...",
  "An empty feed. Did you know you can add new friends by searching for their username?",
  "A day without a dayli is just... a day. Hopefully today's a bit better.",
  "Yesterday's pages are blank. Let's write today's chapter.",
  "Yesterday was just you, me, and the void between us.",
  "A quiet yesterday just leaves space for a big today :)",
  "Nobody posted yesterday. Find better friends ong fr.",
  "Your friends didn't post any daylies yesterday. Are they hiding something from you?",
  "Your friends were being nonchalant yesterday. There's always today!",
] as const;

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full h-full place-items-center py-64 text-center">
      <div className="text-lg text-foreground-secondary font-serif tracking-tight font-medium">
        {children}
      </div>
    </div>
  );
}

/** Released posts from friends, newest day first, loaded a page at a time. */
export function Feed() {
  const router = useRouter();
  const feed = useFeedQuery();
  const [emptyMessage] = useState(
    () => EMPTY_MESSAGES[Math.floor(Math.random() * EMPTY_MESSAGES.length)]
  );

  const unauthenticated =
    feed.error instanceof FeedApiError && feed.error.failure === "unauthenticated";
  useEffect(() => {
    if (unauthenticated) router.replace("/sign-in");
  }, [unauthenticated, router]);

  // A post can only repeat if pages were refetched around a change, so keep
  // the first copy rather than rendering a duplicate key.
  const posts = useMemo(() => {
    const seen = new Map<string, FeedPost>();
    for (const page of feed.data?.pages ?? []) {
      for (const post of page.items) if (!seen.has(post.id)) seen.set(post.id, post);
    }
    return [...seen.values()];
  }, [feed.data]);

  if (feed.isPending) {
    return (
      <Message>
        <p role="status">Loading your friends&apos; daylies...</p>
      </Message>
    );
  }

  if (feed.isError && posts.length === 0) {
    return (
      <Message>
        <p role="alert" className="mb-4">
          {feed.error instanceof FeedApiError && feed.error.failure === "network"
            ? "You seem to be offline. Check your connection and try again."
            : "Your feed couldn't be loaded right now."}
        </p>
        <Button
          onClick={() => void feed.refetch()}
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
        <p>{emptyMessage}</p>
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
          />
        ))}
      </div>

      {(feed.hasNextPage || feed.isFetchNextPageError) && (
        <div className="flex flex-col items-center gap-2">
          {feed.isFetchNextPageError && (
            <p role="alert" className="text-sm text-red-500">
              More daylies couldn&apos;t be loaded. Try again.
            </p>
          )}
          <Button
            onClick={() => void feed.fetchNextPage()}
            disabled={feed.isFetchingNextPage}
            variant={{ color: "accent", size: "sm", weight: "secondary" }}
          >
            {feed.isFetchingNextPage ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

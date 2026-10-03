"use client";

import Link from "next/link";
import { Button } from "@/components/ui/core/Button";
import { useLikesQuery } from "./use-likes-query";

/** The people who liked a post, newest first. */
export function PostLikers({ postId }: { postId: string }) {
  const query = useLikesQuery(postId, true);
  // Access was revoked: show nothing from the pages loaded earlier.
  const gone = query.data?.pages.some((page) => page.unavailable) ?? false;
  const likes = gone ? [] : query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending) return <p role="status" className="text-sm text-foreground-secondary">Loading likes...</p>;
  if (gone) return <p role="alert" className="text-sm text-foreground-secondary">Likes aren&apos;t available.</p>;
  if (query.isError && likes.length === 0) {
    return <p role="alert" className="text-sm text-foreground-secondary">Likes couldn&apos;t be loaded right now.</p>;
  }
  if (likes.length === 0) return <p className="text-sm text-foreground-secondary">No likes yet.</p>;

  return (
    <section aria-label="Liked by" className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {likes.map((like) => (
          <li key={like.person.id}>
            <Link
              href={`/u/${encodeURIComponent(like.person.username)}`}
              className="inline-block rounded-full bg-background-secondary px-3 py-1 text-sm hover:opacity-70"
            >
              {like.person.displayName}
            </Link>
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          variant={{ color: "accent", size: "sm", weight: "secondary" }}
        >
          {query.isFetchingNextPage ? "Loading..." : "Show more"}
        </Button>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { BiHeart, BiSolidHeart } from "react-icons/bi";
import { PostLikers } from "@/features/interactions/list-post-likes/PostLikers";
import type { PostDetail } from "@/features/posts/shared/posts.api";
import { useLikeMutation } from "./use-like-mutation";

/** The heart, the like count, and who liked the post. */
export function PostLikeBar({ post }: { post: PostDetail }) {
  const like = useLikeMutation(post.id);
  const [showingLikers, setShowingLikers] = useState(false);
  const label = post.likeCount === 1 ? "1 like" : `${post.likeCount} likes`;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          aria-pressed={post.viewerHasLiked}
          aria-label={post.viewerHasLiked ? "Unlike" : "Like"}
          disabled={like.isPending}
          onClick={() => like.mutate(!post.viewerHasLiked)}
          className="text-2xl text-foreground-accent transition-transform hover:scale-110 disabled:opacity-60"
        >
          {post.viewerHasLiked ? <BiSolidHeart aria-hidden /> : <BiHeart aria-hidden />}
        </button>
        {post.likeCount > 0 ? (
          <button
            type="button"
            aria-expanded={showingLikers}
            onClick={() => setShowingLikers((open) => !open)}
            className="text-foreground-secondary underline-offset-2 hover:underline"
          >
            {label}
          </button>
        ) : (
          <span className="text-foreground-secondary">{label}</span>
        )}
        {like.isError && (
          <span role="alert" className="text-red-500">
            Your like couldn&apos;t be saved. Try again.
          </span>
        )}
      </div>
      {showingLikers && post.likeCount > 0 && <PostLikers postId={post.id} />}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/core/Button";
import type { PostDetail } from "@/features/posts/shared/posts.api";
import { PostApiError } from "@/features/posts/shared/query-result";
import { usePostQuery } from "./use-post-query";

const NZ_TIME_ZONE = "Pacific/Auckland";

function postedAt(post: PostDetail) {
  // localDate is the Auckland day the post belongs to; acceptedAt gives the time.
  const [year, month, day] = post.localDate.split("-").map(Number);
  const date = new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day!)));
  const time = new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(post.acceptedAt));
  return `${date}, ${time}`;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid w-full place-items-center py-48 text-center">
      <div className="text-lg text-foreground-secondary font-serif tracking-tight font-medium">
        {children}
      </div>
    </div>
  );
}

export function PostDetailView({ username, postId }: { username: string; postId: string }) {
  const router = useRouter();
  const query = usePostQuery(postId);
  const failure = query.error instanceof PostApiError ? query.error.failure : undefined;
  const post = query.data;

  useEffect(() => {
    if (failure === "unauthenticated") router.replace("/sign-in");
  }, [failure, router]);

  // Keep one address per post: a link with a stale or differently cased
  // username is replaced with the author's current one.
  useEffect(() => {
    if (post && post.author.username.toLowerCase() !== username.toLowerCase()) {
      router.replace(`/${post.author.username}/${post.id}`);
    }
  }, [post, username, router]);

  if (query.isPending) {
    return (
      <Centered>
        <p role="status">Loading this dayli...</p>
      </Centered>
    );
  }

  if (!post) {
    if (failure === "notFound") {
      return (
        <Centered>
          <p className="mb-4">This dayli isn&apos;t available. It may have been deleted, or you may no longer have access.</p>
          <Button href="/home" variant={{ color: "accent", size: "sm", weight: "secondary" }}>
            Back to daylies
          </Button>
        </Centered>
      );
    }
    return (
      <Centered>
        <p role="alert" className="mb-4">
          {failure === "network"
            ? "You seem to be offline. Check your connection and try again."
            : "This dayli couldn't be loaded right now."}
        </p>
        <Button
          onClick={() => void query.refetch()}
          variant={{ color: "accent", size: "sm", weight: "secondary" }}
        >
          Try again
        </Button>
      </Centered>
    );
  }

  return (
    <article className="max-w-2xl mx-auto p-8 bg-white rounded-2xl shadow-card space-y-6">
      <header className="flex items-center gap-3">
        <Link href={`/${post.author.username}`} className="flex items-center gap-3 min-w-0 hover:opacity-70 transition-opacity">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-background-accent text-sm font-semibold text-foreground-accent">
            {post.author.displayName[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{post.author.displayName}</p>
            <p className="text-sm text-foreground-secondary truncate">@{post.author.username}</p>
          </div>
        </Link>
        <p className="ml-auto text-sm font-semibold text-foreground-accent" aria-label={`Rated ${post.rating} out of 10`}>
          {post.rating}/10
        </p>
      </header>

      <p className="text-sm text-foreground-secondary">
        {postedAt(post)}
        {post.edited && " · Edited"}
        {post.viewerIsAuthor && (post.audience === "solo" ? " · Only you" : " · Friends")}
      </p>

      <section className="space-y-2">
        <h1 className="text-sm font-medium text-foreground-tertiary">{post.prompt.text}</h1>
        <p className="font-serif text-xl tracking-tight whitespace-pre-line">{post.reflectiveAnswer}</p>
      </section>

      {post.caption && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-foreground-tertiary">Word dump</h2>
          <p className="whitespace-pre-line">{post.caption}</p>
        </section>
      )}
    </article>
  );
}

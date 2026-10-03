"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/core/Button";
import type { PostDetail } from "@/features/posts/shared/posts.api";
import { isVideo, PrivateImage, PrivateVideo } from "@/features/posts/shared/PrivateMedia";
import { PostApiError } from "@/features/posts/shared/query-result";
import { usePostQuery } from "./use-post-query";
import { useSession } from "@/lib/session/hooks";
import { isPublicAction, signInForPublicAction } from "@/lib/routing/public-return-intent";

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

const photoColumns = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

/** One video, or up to three photos, each loaded from a private, expiring URL. */
function PostMedia({ post }: { post: PostDetail }) {
  if (post.media.length === 0) return null;
  const [first] = post.media;
  if (first && isVideo(first)) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <PrivateVideo postId={post.id} media={first} label={`${post.author.displayName}'s video`} />
      </div>
    );
  }
  return (
    <div className={`grid gap-2 ${photoColumns[Math.min(post.media.length, 3)]}`}>
      {post.media.map((media, index) => (
        <div key={media.id} className="relative aspect-square overflow-hidden rounded-xl bg-background-secondary">
          <PrivateImage
            postId={post.id}
            media={media}
            alt={`${post.author.displayName}'s photo ${index + 1} of ${post.media.length}`}
            sizes="(max-width: 768px) 100vw, 672px"
          />
        </div>
      ))}
    </div>
  );
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const query = usePostQuery(postId);
  const failure = query.error instanceof PostApiError ? query.error.failure : undefined;
  const post = query.data;
  const rawIntent = searchParams.get("intent");
  const intent = isPublicAction(rawIntent) && (rawIntent === "like" || rawIntent === "comment") ? rawIntent : null;

  useEffect(() => {
    if (rawIntent && !intent) router.replace(pathname);
  }, [intent, pathname, rawIntent, router]);
  useEffect(() => {
    if (user && intent && query.isSuccess) void query.refetch();
    // Refetch once after the initial authenticated response settles. The action itself always needs another click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, query.isSuccess, user?.id]);

  // Keep one address per post: a link with a stale or differently cased
  // username is replaced with the author's current one.
  useEffect(() => {
    if (post && post.author.username.toLowerCase() !== username.toLowerCase()) {
      router.replace(`/u/${encodeURIComponent(post.author.username)}/${encodeURIComponent(post.id)}${intent ? `?intent=${intent}` : ""}`);
    }
  }, [intent, post, username, router]);

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
        <Link href={`/u/${encodeURIComponent(post.author.username)}`} className="flex items-center gap-3 min-w-0 hover:opacity-70 transition-opacity">
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

      <PostMedia post={post} />

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

      {user && intent && (
        <p role="status" className="rounded-xl bg-background-accent px-4 py-3 text-sm text-foreground-accent">
          You are signed in. {intent === "like" ? "Likes" : "Comments"} are not available in this version yet. Nothing was submitted.
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-foreground/10 pt-5" aria-label="Post actions">
        <Button
          href={user ? undefined : signInForPublicAction(pathname, "like")}
          onClick={user ? () => router.replace(`${pathname}?intent=like`) : undefined}
          variant={{ color: "accent", size: "sm", weight: "secondary" }}
        >
          like
        </Button>
        <Button
          href={user ? undefined : signInForPublicAction(pathname, "comment")}
          onClick={user ? () => router.replace(`${pathname}?intent=comment`) : undefined}
          variant={{ color: "background", size: "sm", weight: "secondary" }}
        >
          comment
        </Button>
      </div>
    </article>
  );
}

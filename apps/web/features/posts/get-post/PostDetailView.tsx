"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/core/Button";
import { Skeleton } from "@/components/ui/core/Skeleton";
import { PostLikeBar } from "@/features/interactions/like-post/PostLikeBar";
import { PostComments } from "@/features/interactions/post-comments/PostComments";
import { DeletePostDialog } from "@/features/posts/delete-post/DeletePostDialog";
import { useDeletePostMutation } from "@/features/posts/delete-post/use-delete-post-mutation";
import { PostRevisions } from "@/features/posts/list-post-revisions/PostRevisions";
import type { PostDetail } from "@/features/posts/shared/posts.api";
import { isVideo, PrivateImage, PrivateVideo } from "@/features/posts/shared/PrivateMedia";
import { PostApiError } from "@/features/posts/shared/query-result";
import { EditPostForm } from "@/features/posts/update-post/EditPostForm";
import { usePostQuery } from "./use-post-query";
import { useSession } from "@/lib/session/hooks";
import { consumePublicIntent, isPublicAction, rememberPublicIntent, resumePublicIntent, signInForPublicAction, withPublicAction, type PublicAction } from "@/lib/routing/public-return-intent";
import { postKeys } from "@/features/posts/shared/posts.keys";

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

/** Today's Auckland date as `YYYY-MM-DD`. */
function aucklandToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: NZ_TIME_ZONE }).format(new Date());
}

const photoColumns = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3"] as const;

function rememberPostIntent(pathname: string, action: PublicAction) {
  return rememberPublicIntent(withPublicAction(pathname, action));
}

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

function PostDetailSkeleton() {
  return (
    <article role="status" aria-label="Loading dayli" className="mx-auto max-w-2xl space-y-6 rounded-2xl bg-white p-8 shadow-card">
      <header className="flex items-center gap-3"><Skeleton className="h-11 w-11 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20" /></div><Skeleton className="ml-auto h-5 w-10" /></header>
      <Skeleton className="h-3 w-48" />
      <div className="space-y-3"><Skeleton className="h-3 w-2/5" /><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-4/5" /><Skeleton className="h-6 w-3/5" /></div>
    </article>
  );
}

export function PostDetailView({ username, postId }: { username: string; postId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isPending: sessionPending } = useSession();
  const client = useQueryClient();
  const query = usePostQuery(postId);
  const failure = query.error instanceof PostApiError ? query.error.failure : undefined;
  const accessRevoked = failure === "notFound" || failure === "unauthenticated";
  const post = accessRevoked ? undefined : query.data;
  const [editing, setEditing] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const remove = useDeletePostMutation(postId);
  const rawIntent = searchParams.get("intent");
  const candidateIntent = isPublicAction(rawIntent) && (rawIntent === "like" || rawIntent === "comment") ? rawIntent : null;
  const presentedTarget = useRef<string | null>(null);
  useEffect(() => {
    if (failure === "unauthenticated") router.replace("/sign-in");
  }, [failure, router]);
  useEffect(() => {
    if (!accessRevoked) return;
    const actor = user?.id ?? "anonymous";
    void client.cancelQueries({ queryKey: postKeys.detail(actor, postId) });
    void client.cancelQueries({ queryKey: postKeys.revisions(actor, postId) });
    client.removeQueries({ queryKey: postKeys.detail(actor, postId) });
    client.removeQueries({ queryKey: postKeys.revisions(actor, postId) });
  }, [accessRevoked, client, postId, user?.id]);
  useEffect(() => {
    if (!rawIntent) {
      presentedTarget.current = null;
      return;
    }
    if (sessionPending) return;
    if (!candidateIntent || !user) {
      router.replace(pathname);
      return;
    }
    const target = `${pathname}?intent=${candidateIntent}`;
    if (presentedTarget.current === target) {
      router.replace(pathname);
      return;
    }
    if (!query.isSuccess || !resumePublicIntent(target, user.id)) {
      if (query.isSuccess) {
        router.replace(pathname);
      }
      return;
    }
    let current = true;
    void query.refetch().then((result) => {
      if (!current) return;
      if (result.status === "success" && consumePublicIntent(target, user.id)) {
        presentedTarget.current = target;
        if (candidateIntent === "comment") {
          requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("textarea[data-composer='post-comment']")?.focus());
        }
      }
      router.replace(pathname);
    });
    return () => { current = false; };
    // Refetch exactly once before consuming the trusted handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateIntent, pathname, query.isSuccess, rawIntent, router, sessionPending, user?.id]);

  // Keep one address per post: a link with a stale or differently cased
  // username is replaced with the author's current one.
  useEffect(() => {
    if (post && post.author.username.toLowerCase() !== username.toLowerCase()) {
      router.replace(`/u/${encodeURIComponent(post.author.username)}/${encodeURIComponent(post.id)}`);
    }
  }, [post, username, router]);

  if (query.isPending) return <PostDetailSkeleton />;

  if (!post) {
    if (accessRevoked) {
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-foreground-secondary">
        <p>
          {postedAt(post)}
          {post.viewerIsAuthor && (post.audience === "solo" ? " · Only you" : " · Friends")}
        </p>
        {post.edited && (user ? (
          <button
            type="button"
            aria-expanded={showingHistory}
            onClick={() => setShowingHistory((open) => !open)}
            className="underline underline-offset-2 hover:text-foreground"
          >
            {showingHistory ? "Hide earlier versions" : "Edited · see earlier versions"}
          </button>
        ) : <span>Edited</span>)}
        {post.viewerIsAuthor && !editing && (
          <div className="ml-auto flex gap-2">
            <Button onClick={() => setEditing(true)} variant={{ color: "foreground", size: "sm", weight: "secondary" }}>
              Edit
            </Button>
            <Button
              onClick={() => setConfirmingDelete(true)}
              variant={{ color: "foreground", size: "sm", weight: "secondary" }}
              className="bg-rose-100 text-rose-600 hover:bg-rose-200"
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <PostMedia post={post} />

      {editing ? (
        <EditPostForm
          post={post}
          onDone={() => setEditing(false)}
          onReload={async () => (await query.refetch()).status === "success"}
        />
      ) : (
        <>
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
        </>
      )}

      {showingHistory && post.edited && <PostRevisions key={post.id} postId={post.id} viewerIsAuthor={post.viewerIsAuthor} />}

      {user && (
        <>
          <PostLikeBar post={post} />
          <PostComments postId={post.id} commentCount={post.commentCount} />
        </>
      )}

      <DeletePostDialog
        open={confirmingDelete}
        isPending={remove.isPending}
        isToday={post.localDate === aucklandToday()}
        error={remove.isError ? "This dayli couldn't be moved to Trash. It has not been changed." : undefined}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => remove.mutate(undefined, {
          onSuccess: () => router.replace(`/u/${encodeURIComponent(post.author.username)}`),
        })}
      />

      {!user && (
        <div className="space-y-3 border-t border-foreground/10 pt-5">
          <p className="text-sm text-foreground-secondary">
            {post.likeCount === 1 ? "1 like" : `${post.likeCount} likes`} · {post.commentCount === 1 ? "1 comment" : `${post.commentCount} comments`}
          </p>
          <div className="flex flex-wrap gap-2" aria-label="Post actions">
            <Button
              href={signInForPublicAction(pathname, "like")}
              onClick={() => rememberPostIntent(pathname, "like")}
              variant={{ color: "accent", size: "sm", weight: "secondary" }}
            >
              like
            </Button>
            <Button
              href={signInForPublicAction(pathname, "comment")}
              onClick={() => rememberPostIntent(pathname, "comment")}
              variant={{ color: "background", size: "sm", weight: "secondary" }}
            >
              comment
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/core/Button";
import { InteractionApiError, type InteractionFailure, type PostComment } from "@/features/interactions/shared/interactions.api";
import { useCommentsQuery, useCreateComment, useDeleteComment, useUpdateComment } from "./use-comments";

const COMMENT_MAX = 1000;
const NZ_TIME_ZONE = "Pacific/Auckland";
const field = "w-full resize-none rounded-lg bg-background-secondary px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-foreground/20";

const failureMessages: Record<InteractionFailure, string> = {
  notFound: "This dayli or comment isn't available any more.",
  conflict: "That comment couldn't be posted. Try again.",
  invalid: "That comment can't be posted. Check it and try again.",
  network: "You seem to be offline. Your comment is still here; try again when you're back online.",
  unauthenticated: "Your session has ended. Sign in again to comment.",
  unavailable: "That couldn't be saved right now. Try again.",
};

function failureMessage(error: unknown) {
  return failureMessages[error instanceof InteractionApiError ? error.failure : "unavailable"];
}

function writtenAt(value: Date) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

/**
 * A text box that keeps one clientCommentId for its draft until the comment
 * is posted, so pressing Post again after a failure never posts it twice.
 */
function CommentComposer({
  postId,
  parentCommentId,
  label,
  onPosted,
  onCancel,
}: {
  postId: string;
  parentCommentId?: string;
  label: string;
  onPosted?: () => void;
  onCancel?: () => void;
}) {
  const create = useCreateComment(postId);
  const [text, setText] = useState("");
  const [clientCommentId, setClientCommentId] = useState(() => crypto.randomUUID());
  const trimmed = text.trim();
  const tooLong = Array.from(trimmed).length > COMMENT_MAX;

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed || tooLong) return;
        create.mutate(
          { clientCommentId, text: trimmed, ...(parentCommentId ? { parentCommentId } : {}) },
          {
            onSuccess: () => {
              setText("");
              setClientCommentId(crypto.randomUUID());
              onPosted?.();
            },
          },
        );
      }}
    >
      <label className="block">
        <span className="sr-only">{label}</span>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            // A different comment needs its own ID; the same text keeps it for retries.
            if (create.isError) {
              create.reset();
              setClientCommentId(crypto.randomUUID());
            }
          }}
          rows={2}
          placeholder={label}
          className={field}
        />
      </label>
      {tooLong && <p className="text-xs text-red-500">Keep it to {COMMENT_MAX} characters.</p>}
      {create.isError && <p role="alert" className="text-xs text-red-500">{failureMessage(create.error)}</p>}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={create.isPending || !trimmed || tooLong}
          variant={{ color: "accent", size: "sm", weight: "secondary" }}
        >
          {create.isPending ? "Posting..." : create.isError ? "Try again" : parentCommentId ? "Post reply" : "Post"}
        </Button>
        {onCancel && (
          <Button type="button" onClick={onCancel} variant={{ color: "foreground", size: "sm", weight: "secondary" }}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function CommentItem({
  postId,
  comment,
  onReply,
}: {
  postId: string;
  comment: PostComment;
  onReply?: () => void;
}) {
  const update = useUpdateComment(postId);
  const remove = useDeleteComment(postId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.text);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const trimmed = draft.trim();

  return (
    <article aria-label={`Comment by ${comment.author.displayName}`} className="space-y-1">
      <p className="text-xs text-foreground-secondary">
        <Link href={`/u/${encodeURIComponent(comment.author.username)}`} className="font-semibold text-foreground hover:opacity-70">
          {comment.author.displayName}
        </Link>
        {" · "}
        {writtenAt(comment.createdAt)}
        {comment.editedAt && " · edited"}
      </p>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed || Array.from(trimmed).length > COMMENT_MAX) return;
            update.mutate({ commentId: comment.id, text: trimmed }, { onSuccess: () => setEditing(false) });
          }}
        >
          <label className="block">
            <span className="sr-only">Edit your comment</span>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} className={field} />
          </label>
          {update.isError && <p role="alert" className="text-xs text-red-500">{failureMessage(update.error)}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={update.isPending || !trimmed} variant={{ color: "accent", size: "sm", weight: "secondary" }}>
              {update.isPending ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(comment.text);
                update.reset();
              }}
              variant={{ color: "foreground", size: "sm", weight: "secondary" }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-line text-sm">{comment.text}</p>
      )}
      {!editing && (
        <div className="flex gap-3 text-xs text-foreground-secondary">
          {onReply && <button type="button" onClick={onReply} className="hover:text-foreground">Reply</button>}
          {comment.viewerCanEdit && <button type="button" onClick={() => setEditing(true)} className="hover:text-foreground">Edit</button>}
          {comment.viewerCanDelete && !confirmingDelete && (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="hover:text-foreground">Delete</button>
          )}
          {confirmingDelete && (
            <span className="flex gap-2">
              <span>{comment.parentCommentId ? "Delete this reply?" : "Delete this comment and its replies?"}</span>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(comment.id)}
                className="font-semibold text-rose-600"
              >
                {remove.isPending ? "Deleting..." : "Yes, delete"}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="hover:text-foreground">Keep</button>
            </span>
          )}
        </div>
      )}
      {remove.isError && <p role="alert" className="text-xs text-red-500">{failureMessage(remove.error)}</p>}
    </article>
  );
}

/** Comments with one level of replies, oldest first. */
export function PostComments({ postId, commentCount }: { postId: string; commentCount: number }) {
  const query = useCommentsQuery(postId);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const comments = query.data?.pages.flatMap((page) => page.items) ?? [];
  const topLevel = comments.filter((comment) => comment.parentCommentId === null);
  const replies = (parentId: string) => comments.filter((comment) => comment.parentCommentId === parentId);

  return (
    <section aria-label="Comments" className="space-y-4 border-t border-background-secondary pt-4">
      <h2 className="text-sm font-medium text-foreground-tertiary">
        {commentCount === 1 ? "1 comment" : `${commentCount} comments`}
      </h2>

      {query.isPending ? (
        <p role="status" className="text-sm text-foreground-secondary">Loading comments...</p>
      ) : query.isError && comments.length === 0 ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-foreground-secondary">Comments couldn&apos;t be loaded right now.</p>
          <Button onClick={() => void query.refetch()} variant={{ color: "accent", size: "sm", weight: "secondary" }}>
            Try again
          </Button>
        </div>
      ) : (
        <ol className="space-y-4">
          {topLevel.map((comment) => (
            <li key={comment.id} className="space-y-3">
              <CommentItem postId={postId} comment={comment} onReply={() => setReplyingTo(comment.id)} />
              {(replies(comment.id).length > 0 || replyingTo === comment.id) && (
                <ol className="ml-6 space-y-3 border-l border-background-secondary pl-4">
                  {replies(comment.id).map((reply) => (
                    <li key={reply.id}>
                      <CommentItem postId={postId} comment={reply} />
                    </li>
                  ))}
                  {replyingTo === comment.id && (
                    <li>
                      <CommentComposer
                        postId={postId}
                        parentCommentId={comment.id}
                        label={`Reply to ${comment.author.displayName}`}
                        onPosted={() => setReplyingTo(null)}
                        onCancel={() => setReplyingTo(null)}
                      />
                    </li>
                  )}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}

      {query.hasNextPage && (
        <Button
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          variant={{ color: "accent", size: "sm", weight: "secondary" }}
        >
          {query.isFetchingNextPage ? "Loading..." : "Show more comments"}
        </Button>
      )}

      <CommentComposer postId={postId} label="Add a comment" />
    </section>
  );
}

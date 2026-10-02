"use client";

import { Button } from "@/components/ui/core/Button";
import { PostApiError } from "@/features/posts/shared/query-result";
import { usePostRevisionsQuery } from "./use-post-revisions-query";

const NZ_TIME_ZONE = "Pacific/Auckland";

function replacedAt(value: Date) {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(value);
}

/** Earlier versions of a post, as the caller is allowed to see them. */
export function PostRevisions({ postId, viewerIsAuthor }: { postId: string; viewerIsAuthor: boolean }) {
  const query = usePostRevisionsQuery(postId, true);
  const revisions = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (query.isPending) return <p role="status" className="text-sm text-foreground-secondary">Loading earlier versions...</p>;
  if (query.isError && revisions.length === 0) {
    const notFound = query.error instanceof PostApiError && query.error.failure === "notFound";
    return (
      <p role="alert" className="text-sm text-foreground-secondary">
        {notFound ? "Earlier versions aren't available." : "Earlier versions couldn't be loaded right now."}
      </p>
    );
  }

  return (
    <section aria-label="Earlier versions" className="space-y-4 border-t border-background-secondary pt-4">
      <ol className="space-y-4">
        {revisions.map((revision) => (
          <li key={revision.revisionNumber} className="space-y-1 rounded-xl bg-background-secondary p-4">
            <p className="text-xs text-foreground-secondary">
              Version {revision.revisionNumber} · replaced {replacedAt(revision.replacedAt)} · {revision.rating}/10
              {viewerIsAuthor && (revision.audience === "solo" ? " · Only you" : " · Friends")}
            </p>
            <p className="font-serif whitespace-pre-line">{revision.reflectiveAnswer}</p>
            {revision.caption && <p className="text-sm whitespace-pre-line">{revision.caption}</p>}
          </li>
        ))}
      </ol>
      {query.hasNextPage && (
        <Button
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          variant={{ color: "accent", size: "sm", weight: "secondary" }}
        >
          {query.isFetchingNextPage ? "Loading..." : "Show older versions"}
        </Button>
      )}
    </section>
  );
}

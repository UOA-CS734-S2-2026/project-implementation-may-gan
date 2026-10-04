"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/core/Button";
import { PostApiError } from "@/features/posts/shared/query-result";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { useSession } from "@/lib/session/hooks";
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
  const { user } = useSession();
  const client = useQueryClient();
  const query = usePostRevisionsQuery(postId, true);
  const failure = query.error instanceof PostApiError ? query.error.failure : undefined;
  const revocationError = failure === "notFound" || failure === "unauthenticated";
  const [revoked, setRevoked] = useState(false);
  if (revocationError && !revoked) setRevoked(true);
  const concealed = revoked || revocationError;
  const revisions = concealed ? [] : query.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (!revocationError) return;
    const key = postKeys.revisions(user?.id ?? "anonymous", postId);
    void client.cancelQueries({ queryKey: key });
    client.removeQueries({ queryKey: key });
  }, [client, postId, revocationError, user?.id]);

  if (concealed) {
    return <p role="alert" className="text-sm text-foreground-secondary">Earlier versions aren&apos;t available.</p>;
  }
  if (query.isPending) return <p role="status" className="text-sm text-foreground-secondary">Loading earlier versions...</p>;
  if (query.isError && revisions.length === 0) {
    return <p role="alert" className="text-sm text-foreground-secondary">Earlier versions couldn&apos;t be loaded right now.</p>;
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

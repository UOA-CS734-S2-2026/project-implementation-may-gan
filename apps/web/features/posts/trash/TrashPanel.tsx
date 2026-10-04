"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { feedKeys } from "@/features/feed/shared/feed.keys";
import { interactionKeys } from "@/features/interactions/shared/interactions.api";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { postsApi, type PostFailure } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { Button } from "@/components/ui/core/Button";

const trashKey = (actorId: string) => [...postKeys.all(actorId), "trash"] as const;

class TrashFailure extends Error {
  constructor(readonly failure: PostFailure) { super(failure); }
}

export function TrashPanel({ actorId }: { actorId: string }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: trashKey(actorId),
    queryFn: async () => {
      const result = await postsApi.trash();
      if (!result.ok) throw new TrashFailure(result.failure);
      return result.value;
    },
  });
  const restore = useMutation({
    mutationFn: async (postId: string) => {
      const result = await postsApi.restore(postId);
      if (!result.ok) throw new TrashFailure(result.failure);
      return postId;
    },
    onSuccess: async (postId) => {
      client.removeQueries({ queryKey: postKeys.detail(actorId, postId) });
      client.removeQueries({ queryKey: postKeys.revisions(actorId, postId) });
      client.removeQueries({ queryKey: interactionKeys.comments(actorId, postId) });
      client.removeQueries({ queryKey: interactionKeys.likes(actorId, postId) });
      await Promise.all([
        client.invalidateQueries({ queryKey: trashKey(actorId) }),
        client.invalidateQueries({ queryKey: postKeys.all(actorId) }),
        client.invalidateQueries({ queryKey: feedKeys.list(actorId) }),
        client.invalidateQueries({ queryKey: profileKeys.all(actorId) }),
      ]);
    },
  });

  return (
    <section className="space-y-3 rounded-lg border border-foreground/10 p-4" aria-labelledby="trash-heading">
      <div>
        <h2 id="trash-heading" className="text-sm font-medium">Trash</h2>
        <p className="text-xs text-foreground/60">Posts can be restored for 7 days. Permanent cleanup starts 14 days after deletion.</p>
      </div>
      {query.isPending ? <p className="text-sm text-foreground/60">Loading Trash...</p> : query.isError ? (
        <p role="alert" className="text-sm text-red-600">Trash could not be loaded. Your posts have not been changed.</p>
      ) : query.data.length === 0 ? <p className="text-sm text-foreground/60">Trash is empty.</p> : (
        <ul className="space-y-3">
          {query.data.map((post) => {
            const restorable = post.restoreUntil.getTime() >= query.dataUpdatedAt && !post.pendingCleanup;
            const failed = restore.error instanceof TrashFailure && restore.variables === post.id ? restore.error.failure : undefined;
            return <li key={`${post.id}:${post.generation}`} className="rounded-lg bg-foreground/[0.04] p-3 text-sm">
              <p className="font-medium">Dayli from {post.localDate}</p>
              <p className="mt-1 text-xs text-foreground/60">Restore by {post.restoreUntil.toLocaleString()}. Permanent cleanup is due {post.purgeDueAt.toLocaleString()}.</p>
              {failed && <p role="alert" className="mt-2 text-xs text-red-600">{failed === "conflict" ? "This day already has a replacement, so the original cannot be restored." : "Restore failed. The post remains in Trash."}</p>}
              <Button className="mt-3" disabled={!restorable || (restore.isPending && restore.variables === post.id)} onClick={() => restore.mutate(post.id)} variant={{ weight: "secondary", size: "sm", color: "foreground" }}>
                {restore.isPending && restore.variables === post.id ? "Restoring..." : restorable ? "Restore" : "Restore period ended"}
              </Button>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}

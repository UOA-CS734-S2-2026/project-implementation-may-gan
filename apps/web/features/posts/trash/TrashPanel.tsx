"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { feedKeys } from "@/features/feed/shared/feed.keys";
import { interactionKeys } from "@/features/interactions/shared/interactions.api";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { postsApi, type PostRestoreFailure, type TrashedPostStatus } from "@/features/posts/shared/posts.api";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { Button } from "@/components/ui/core/Button";
import { authClient } from "@/lib/auth/client";

const trashKey = (actorId: string) => [...postKeys.all(actorId), "trash"] as const;

class TrashFailure extends Error {
  constructor(readonly failure: PostRestoreFailure) { super(failure); }
}

export function TrashPanel({ actorId }: { actorId: string }) {
  const client = useQueryClient();
  const router = useRouter();
  const mounted = useRef(true);
  const [deadlineNow, setDeadlineNow] = useState(0);
  const [sessionRevoked, setSessionRevoked] = useState(false);
  const [restoredIds, setRestoredIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const expireSession = async () => {
    if (!mounted.current) return;
    setSessionRevoked(true);
    client.removeQueries({ queryKey: postKeys.all(actorId) });
    await authClient.signOut().catch(() => undefined);
    if (mounted.current) router.replace("/sign-in");
  };
  const query = useQuery({
    queryKey: trashKey(actorId),
    queryFn: async () => {
      const result = await postsApi.trash();
      if (!result.ok) throw new TrashFailure(result.failure);
      return result.value;
    },
  });
  useEffect(() => {
    if (!(query.error instanceof TrashFailure) || query.error.failure !== "unauthenticated") return;
    void expireSession();
  // expireSession is bound to this actor-keyed component instance.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.error]);
  useEffect(() => {
    if (!query.data?.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = Date.now();
      setDeadlineNow(now);
      const next = query.data.map((post) => post.restoreUntil.getTime()).filter((deadline) => deadline > now)
        .sort((left, right) => left - right)[0];
      if (next !== undefined) timer = setTimeout(tick, Math.min(next - now + 25, 2_147_000_000));
    };
    tick();
    return () => { if (timer) clearTimeout(timer); };
  }, [query.data]);
  const restore = useMutation({
    mutationFn: async (postId: string) => {
      const result = await postsApi.restore(postId);
      if (!result.ok) throw new TrashFailure(result.failure);
      return postId;
    },
    onSuccess: async (postId) => {
      if (!mounted.current) return;
      setRestoredIds((current) => new Set([...current, postId]));
      client.setQueryData<TrashedPostStatus[]>(
        trashKey(actorId),
        (current) => current?.filter((post) => post.id !== postId),
      );
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
    onError: (error) => {
      if (error instanceof TrashFailure && error.failure === "unauthenticated") void expireSession();
    },
  });

  if (sessionRevoked) return null;
  const visiblePosts = query.data?.filter((post) => !restoredIds.has(post.id));

  return (
    <section className="space-y-3 rounded-lg border border-foreground/10 p-4" aria-labelledby="trash-heading">
      <div>
        <h2 id="trash-heading" className="text-sm font-medium">Trash</h2>
        <p className="text-xs text-foreground/60">Posts can be restored for 7 days. Permanent cleanup starts 14 days after deletion.</p>
      </div>
      {query.isPending ? <p className="text-sm text-foreground/60">Loading Trash...</p> : query.isError ? (
        <p role="alert" className="text-sm text-red-600">Trash could not be loaded. Your posts have not been changed.</p>
      ) : visiblePosts?.length === 0 ? <p className="text-sm text-foreground/60">Trash is empty.</p> : (
        <ul className="space-y-3">
          {visiblePosts?.map((post) => {
            const restorable = post.restoreUntil.getTime() >= Math.max(deadlineNow, query.dataUpdatedAt) && !post.pendingCleanup;
            const failed = restore.error instanceof TrashFailure && restore.variables === post.id ? restore.error.failure : undefined;
            const failureMessage = failed === "dayOccupied"
              ? "This day already has a replacement, so the original cannot be restored."
              : failed === "expired" ? "The 7-day restore period has ended."
              : failed === "restricted" ? "This post cannot be restored while the account lifecycle is restricted."
              : failed === "conflict" ? "Cleanup has already claimed this post. Try refreshing Trash."
              : failed ? "Restore failed. The post remains in Trash." : undefined;
            return <li key={`${post.id}:${post.generation}`} className="rounded-lg bg-foreground/[0.04] p-3 text-sm">
              <p className="font-medium">Dayli from {post.localDate}</p>
              <p className="mt-1 text-xs text-foreground/60">Restore by {post.restoreUntil.toLocaleString()}. Permanent cleanup is due {post.purgeDueAt.toLocaleString()}.</p>
              {failureMessage && <p role="alert" className="mt-2 text-xs text-red-600">{failureMessage}</p>}
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

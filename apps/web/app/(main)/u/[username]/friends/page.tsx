"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session/hooks";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  loadFriends,
  loadRequests,
  removeFriend,
  type FriendCard,
  type FriendRequest,
  type FriendsFailure,
  type FriendsResult,
} from "@/lib/api/friends";
import { FriendsTabs } from "./_components/FriendsTabs";

type Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
const emptyPage = <T,>(): Page<T> => ({ items: [], nextCursor: null, hasMore: false });
const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()];

const failureMessage: Record<FriendsFailure, string> = {
  unauthenticated: "Your session ended. Please sign in again.",
  network: "You're offline. Check your connection and try again.",
  unavailable: "Friends could not load right now.",
  rateLimited: "Slow down for a moment, then try again.",
  conflict: "That relationship changed. We refreshed the list.",
};

export default function FriendsPage() {
  const { user } = useSession();
  return <FriendsContent key={user?.id ?? "signed-out"} accountId={user?.id ?? null} />;
}

function FriendsContent({ accountId }: { accountId: string | null }) {
  const sessionEpoch = useRef(0);
  const bootstrapGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const continuationGeneration = useRef<Record<string, number>>({});
  const alive = useRef(true);
  const [friends, setFriends] = useState<Page<FriendCard>>(emptyPage);
  const [incoming, setIncoming] = useState<Page<FriendRequest>>(emptyPage);
  const [outgoing, setOutgoing] = useState<Page<FriendRequest>>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const validSession = (epoch: number) => alive.current && epoch === sessionEpoch.current;

  const refresh = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const requestGeneration = ++bootstrapGeneration.current;
    setLoading(true);
    setError(null);
    setFriends(emptyPage);
    setIncoming(emptyPage);
    setOutgoing(emptyPage);
    const [friendResult, incomingResult, outgoingResult] = await Promise.all([loadFriends(), loadRequests("incoming"), loadRequests("outgoing")]);
    if (!validSession(epoch) || requestGeneration !== bootstrapGeneration.current) return;
    if (!friendResult.ok) setError(failureMessage[friendResult.failure]); else setFriends(friendResult.value);
    if (!incomingResult.ok) setError(failureMessage[incomingResult.failure]); else setIncoming(incomingResult.value);
    if (!outgoingResult.ok) setError(failureMessage[outgoingResult.failure]); else setOutgoing(outgoingResult.value);
    setLoading(false);
  // The keyed actor owns these requests and cannot inherit another account's state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => { alive.current = false; sessionEpoch.current += 1; window.clearTimeout(timer); };
  }, [refresh]);

  const mutate = async (key: string, operation: () => Promise<FriendsResult<unknown>>) => {
    const epoch = sessionEpoch.current;
    const requestGeneration = ++mutationGeneration.current;
    setBusy(key);
    setError(null);
    const response = await operation();
    if (!validSession(epoch) || requestGeneration !== mutationGeneration.current) return;
    setBusy(null);
    if (!response.ok) { setError(failureMessage[response.failure]); return; }
    await refresh();
  };

  const loadMore = async <T extends { id: string }>(key: string, cursor: string | null, operation: (cursor: string) => Promise<FriendsResult<Page<T>>>, update: React.Dispatch<React.SetStateAction<Page<T>>>) => {
    if (!cursor) return;
    const epoch = sessionEpoch.current;
    const requestGeneration = (continuationGeneration.current[key] ?? 0) + 1;
    continuationGeneration.current[key] = requestGeneration;
    const response = await operation(cursor);
    if (!validSession(epoch) || requestGeneration !== continuationGeneration.current[key]) return;
    if (!response.ok) { setError(failureMessage[response.failure]); return; }
    update((current) => ({ ...response.value, items: mergeById(current.items, response.value.items) }));
  };

  return <section className="mx-auto min-h-screen w-full max-w-[480px] px-4 py-12">
    <h1 className="mb-6 text-center font-serif text-4xl font-semibold tracking-tighter text-foreground">friends</h1>
    {error && <div role="alert" className="mb-6 rounded-2xl border border-foreground/10 bg-background px-5 py-4 font-sans text-sm text-foreground-secondary">{error} <button type="button" className="font-medium underline underline-offset-4" onClick={() => void refresh()}>Try again</button></div>}
    <FriendsTabs
      friends={friends}
      incoming={incoming}
      outgoing={outgoing}
      loading={loading}
      busy={busy}
      onAccept={(requestId) => void mutate(requestId, () => acceptFriendRequest(requestId))}
      onDecline={(requestId) => void mutate(requestId, () => declineFriendRequest(requestId))}
      onCancel={(requestId) => void mutate(requestId, () => cancelFriendRequest(requestId))}
      onRemove={(userId) => void mutate(userId, () => removeFriend(userId))}
      onLoadMoreFriends={() => void loadMore("friends", friends.nextCursor, loadFriends, setFriends)}
      onLoadMoreIncoming={() => void loadMore("incoming", incoming.nextCursor, (cursor) => loadRequests("incoming", cursor), setIncoming)}
      onLoadMoreOutgoing={() => void loadMore("outgoing", outgoing.nextCursor, (cursor) => loadRequests("outgoing", cursor), setOutgoing)}
    />
  </section>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session/hooks";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  loadFriends,
  loadRequests,
  removeFriend,
  searchFriends,
  sendFriendRequest,
  type FriendCard,
  type FriendRequest,
  type FriendsFailure,
  type FriendsResult,
} from "@/lib/api/friends";

type Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
const emptyPage = <T,>(): Page<T> => ({ items: [], nextCursor: null, hasMore: false });
const mergeById = <T extends { id: string }>(current: T[], incoming: T[]) => [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()];

const failureMessage: Record<FriendsFailure, string> = {
  unauthenticated: "Your session ended. Please sign in again.", network: "You're offline. Check your connection and try again.", unavailable: "Friends could not load right now.", rateLimited: "Slow down for a moment, then try searching again.", conflict: "That relationship changed. We refreshed the list.",
};

export default function FriendsPage() {
  const { user } = useSession();
  return <FriendsContent key={user?.id ?? "signed-out"} accountId={user?.id ?? null} />;
}

function FriendsContent({ accountId }: { accountId: string | null }) {
  const sessionEpoch = useRef(0);
  const bootstrapGeneration = useRef(0);
  const searchGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const continuationGeneration = useRef<Record<string, number>>({});
  const alive = useRef(true);
  const [friends, setFriends] = useState<Page<FriendCard>>(emptyPage);
  const [incoming, setIncoming] = useState<Page<FriendRequest>>(emptyPage);
  const [outgoing, setOutgoing] = useState<Page<FriendRequest>>(emptyPage);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Page<FriendCard>>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const validSession = (epoch: number) => alive.current && epoch === sessionEpoch.current;

  const refresh = useCallback(async () => {
    const epoch = sessionEpoch.current;
    const requestGeneration = ++bootstrapGeneration.current;
    setLoading(true); setError(null); setFriends(emptyPage); setIncoming(emptyPage); setOutgoing(emptyPage); setResults(emptyPage);
    const [friendResult, incomingResult, outgoingResult] = await Promise.all([loadFriends(), loadRequests("incoming"), loadRequests("outgoing")]);
    if (!validSession(epoch) || requestGeneration !== bootstrapGeneration.current) return;
    if (!friendResult.ok) setError(failureMessage[friendResult.failure]); else setFriends(friendResult.value);
    if (!incomingResult.ok) setError(failureMessage[incomingResult.failure]); else setIncoming(incomingResult.value);
    if (!outgoingResult.ok) setError(failureMessage[outgoingResult.failure]); else setOutgoing(outgoingResult.value);
    setLoading(false);
  // The component is keyed by accountId. A new account owns a new generation and never inherits this state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    // Strict Mode replays effects without remounting this state instance.
    // A new effect must reactivate the session after its prior cleanup.
    alive.current = true;
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => { alive.current = false; sessionEpoch.current += 1; window.clearTimeout(timer); };
  }, [refresh]);

  const search = useCallback((value: string, cursor?: string) => {
    const normalized = value.trim();
    const epoch = sessionEpoch.current;
    const requestGeneration = ++searchGeneration.current;
    if (normalized.length < 2) { setResults(emptyPage); setSearching(false); return; }
    window.setTimeout(async () => {
      if (!validSession(epoch) || requestGeneration !== searchGeneration.current) return;
      setSearching(true);
      const response = await searchFriends(normalized, cursor);
      if (!validSession(epoch) || requestGeneration !== searchGeneration.current) return;
      setSearching(false);
      if (!response.ok) { setError(failureMessage[response.failure]); return; }
      setResults((current) => cursor ? { ...response.value, items: mergeById(current.items, response.value.items) } : response.value);
    }, cursor ? 0 : 300);
  }, []);

  const mutate = async (key: string, operation: () => Promise<FriendsResult<unknown>>) => {
    const epoch = sessionEpoch.current;
    const requestGeneration = ++mutationGeneration.current;
    setBusy(key); setError(null);
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

  return <section className="w-full max-w-5xl mx-auto px-5 md:px-10 py-16 md:py-20">
    <header className="max-w-2xl mb-10"><p className="font-serif text-sm font-semibold text-foreground-tertiary">your people</p><h1 className="font-serif tracking-tight text-5xl md:text-6xl font-medium mt-2">friends</h1><p className="font-serif text-lg text-foreground-secondary mt-3">Find people by username, then keep your circle close.</p></header>
    <div className="bg-background rounded-2xl shadow-card p-5 md:p-7 mb-10"><label htmlFor="friend-search" className="block font-serif text-xl font-semibold tracking-tight">find someone</label><div className="mt-3 flex gap-3 items-center border-b-2 border-foreground/15 focus-within:border-foreground-accent"><span aria-hidden className="font-serif text-2xl text-foreground-tertiary">@</span><input id="friend-search" value={query} onChange={(event) => { const next = event.target.value; setQuery(next); search(next); }} placeholder="username" autoComplete="off" maxLength={32} className="w-full bg-transparent py-3 font-serif text-lg outline-none placeholder:text-foreground-tertiary" />{searching && <span className="text-sm text-foreground-tertiary">searching</span>}</div><p className="mt-3 text-sm text-foreground-tertiary">Search starts after two characters. Private accounts appear only as a username and display name.</p>{query.trim().length >= 2 && !searching && results.items.length === 0 && <p className="mt-5 font-serif text-foreground-secondary">No matching usernames yet.</p>}<div className="mt-5 grid gap-3 sm:grid-cols-2">{results.items.map((person) => <Person key={person.id} person={person} action={person.relationship === "none" ? "add friend" : person.relationship === "incoming_pending" ? "check requests" : person.relationship === "outgoing_pending" ? "request sent" : "friends"} disabled={person.relationship !== "none" || busy === person.id} onAction={() => void mutate(person.id, () => sendFriendRequest(person.id))} />)}</div><More visible={results.hasMore} onClick={() => search(query, results.nextCursor ?? undefined)} /></div>
    {error && <div role="alert" className="mb-8 rounded-xl bg-red-950/10 px-5 py-4 font-serif text-foreground-secondary">{error} <button className="underline font-semibold" onClick={() => void refresh()}>Try again</button></div>}
    <div className="grid gap-8 lg:grid-cols-2"><section className="bg-background rounded-2xl shadow-card p-6"><h2 className="font-serif text-3xl font-semibold tracking-tight">requests</h2>{loading ? <Loading /> : <div className="mt-5 space-y-7"><RequestGroup title="incoming" empty="No one is waiting on you." requests={incoming.items} busy={busy} actions={(request) => <><Action label="accept" disabled={busy === request.id} onClick={() => void mutate(request.id, () => acceptFriendRequest(request.id))} /><Action label="decline" muted disabled={busy === request.id} onClick={() => void mutate(request.id, () => declineFriendRequest(request.id))} /></>} /><More visible={incoming.hasMore} onClick={() => void loadMore("incoming", incoming.nextCursor, (cursor) => loadRequests("incoming", cursor), setIncoming)} /><RequestGroup title="sent" empty="You have not sent any requests." requests={outgoing.items} busy={busy} actions={(request) => <Action label="cancel request" muted disabled={busy === request.id} onClick={() => void mutate(request.id, () => cancelFriendRequest(request.id))} />} /><More visible={outgoing.hasMore} onClick={() => void loadMore("outgoing", outgoing.nextCursor, (cursor) => loadRequests("outgoing", cursor), setOutgoing)} /></div>}</section><section className="bg-background rounded-2xl shadow-card p-6"><h2 className="font-serif text-3xl font-semibold tracking-tight">your circle</h2>{loading ? <Loading /> : friends.items.length === 0 ? <p className="mt-5 font-serif text-foreground-secondary">No friends here yet. Search a username to start.</p> : <div className="mt-5 space-y-3">{friends.items.map((person) => <Person key={person.id} person={person} action="remove" disabled={busy === person.id} onAction={() => void mutate(person.id, () => removeFriend(person.id))} muted />)}<More visible={friends.hasMore} onClick={() => void loadMore("friends", friends.nextCursor, loadFriends, setFriends)} /></div>}</section></div>
  </section>;
}

function Loading() { return <p className="mt-5 font-serif text-foreground-secondary">Loading your circle...</p>; }
function More({ visible, onClick }: { visible: boolean; onClick: () => void }) { return visible ? <button onClick={onClick} className="mt-4 font-serif text-sm font-semibold underline">load more</button> : null; }
function Action({ label, disabled, onClick, muted = false }: { label: string; disabled: boolean; onClick: () => void; muted?: boolean }) { return <button disabled={disabled} onClick={onClick} className={`rounded-lg px-3 py-2 font-serif text-sm font-semibold disabled:opacity-50 ${muted ? "bg-background-tertiary text-foreground" : "bg-background-accent text-foreground-accent"}`}>{label}</button>; }
function Person({ person, action, disabled, onAction, muted = false }: { person: FriendCard; action: string; disabled: boolean; onAction: () => void; muted?: boolean }) { return <div className="flex items-center justify-between gap-3 rounded-xl bg-background-tertiary/60 px-4 py-3"><Link href={`/${person.username}`} className="min-w-0 rounded focus:outline-none focus:ring-2 focus:ring-accent"><p className="truncate font-serif text-lg font-semibold">{person.displayName}</p><p className="truncate text-sm text-foreground-tertiary">@{person.username}</p></Link><div className="flex shrink-0 gap-2">{person.relationship === "friends" && <Link href={`/messages/new/${person.username}`} className="rounded-lg border border-foreground/20 px-3 py-2 font-serif text-sm font-semibold">message</Link>}<Action label={action} disabled={disabled} onClick={onAction} muted={muted || action !== "add friend"} /></div></div>; }
function RequestGroup({ title, empty, requests, actions }: { title: string; empty: string; requests: FriendRequest[]; busy: string | null; actions: (request: FriendRequest) => React.ReactNode }) { return <div><h3 className="font-serif text-lg font-semibold text-foreground-secondary">{title}</h3>{requests.length === 0 ? <p className="mt-2 text-sm text-foreground-tertiary">{empty}</p> : <div className="mt-3 space-y-3">{requests.map((request) => request.user && <div key={request.id} className="flex items-center justify-between gap-3"><div><p className="font-serif font-semibold">{request.user.displayName}</p><p className="text-sm text-foreground-tertiary">@{request.user.username}</p></div><div className="flex gap-2">{actions(request)}</div></div>)}</div>}</div>; }

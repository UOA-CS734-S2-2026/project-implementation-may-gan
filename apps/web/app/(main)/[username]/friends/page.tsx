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
  searchFriends,
  sendFriendRequest,
  type FriendCard,
  type FriendRequest,
  type FriendsFailure,
} from "@/lib/api/friends";

const failureMessage: Record<FriendsFailure, string> = {
  unauthenticated: "Your session ended. Please sign in again.",
  network: "You're offline. Check your connection and try again.",
  unavailable: "Friends could not load right now.",
  rateLimited: "Slow down for a moment, then try searching again.",
  conflict: "That relationship changed. We refreshed the list.",
};

export default function FriendsPage() {
  const { user } = useSession();
  const generation = useRef(0);
  const [friends, setFriends] = useState<FriendCard[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FriendCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setResults([]);
    setLoading(true);
    setError(null);
    const [friendResult, requestResult] = await Promise.all([loadFriends(), loadRequests()]);
    if (requestGeneration !== generation.current) return;
    if (!friendResult.ok) setError(failureMessage[friendResult.failure]);
    else setFriends(friendResult.value.items);
    if (!requestResult.ok) setError(failureMessage[requestResult.failure]);
    else setRequests(requestResult.value.items.filter((request) => request.user));
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [refresh, user?.id]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const requestGeneration = ++generation.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const result = await searchFriends(normalized);
      if (requestGeneration !== generation.current) return;
      setSearching(false);
      if (!result.ok) {
        setError(failureMessage[result.failure]);
        return;
      }
      setResults(result.value.items);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const mutate = async (key: string, operation: () => ReturnType<typeof sendFriendRequest>) => {
    setBusy(key);
    setError(null);
    const result = await operation();
    if (!result.ok) setError(failureMessage[result.failure]);
    setBusy(null);
    await refresh();
  };

  const incoming = requests.filter((request) => request.recipientId === user?.id);
  const outgoing = requests.filter((request) => request.senderId === user?.id);

  return (
    <section className="w-full max-w-5xl mx-auto px-5 md:px-10 py-16 md:py-20">
      <header className="max-w-2xl mb-10">
        <p className="font-serif text-sm font-semibold text-foreground-tertiary">your people</p>
        <h1 className="font-serif tracking-tight text-5xl md:text-6xl font-medium mt-2">friends</h1>
        <p className="font-serif text-lg text-foreground-secondary mt-3">Find people by username, then keep your circle close.</p>
      </header>

      <div className="bg-background rounded-2xl shadow-card p-5 md:p-7 mb-10">
        <label htmlFor="friend-search" className="block font-serif text-xl font-semibold tracking-tight">find someone</label>
        <div className="mt-3 flex gap-3 items-center border-b-2 border-foreground/15 focus-within:border-foreground-accent transition-colors">
          <span aria-hidden className="font-serif text-2xl text-foreground-tertiary">@</span>
          <input id="friend-search" value={query} onChange={(event) => { const next = event.target.value; setQuery(next); if (next.trim().length < 2) setResults([]); }} placeholder="username" autoComplete="off" maxLength={32} className="w-full bg-transparent py-3 font-serif text-lg outline-none placeholder:text-foreground-tertiary" />
          {searching && <span className="text-sm text-foreground-tertiary">searching</span>}
        </div>
        <p className="mt-3 text-sm text-foreground-tertiary">Search starts after two characters. Private accounts appear only as a username and display name.</p>
        {query.trim().length >= 2 && !searching && results.length === 0 && <p className="mt-5 font-serif text-foreground-secondary">No matching usernames yet.</p>}
        {results.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2">{results.map((person) => <Person key={person.id} person={person} action={person.relationship === "none" ? "add friend" : person.relationship === "incoming_pending" ? "check requests" : person.relationship === "outgoing_pending" ? "request sent" : "friends"} disabled={person.relationship !== "none" || busy === person.id} onAction={() => void mutate(person.id, () => sendFriendRequest(person.id))} />)}</div>}
      </div>

      {error && <div role="alert" className="mb-8 rounded-xl bg-red-950/10 px-5 py-4 font-serif text-foreground-secondary">{error} <button className="underline font-semibold" onClick={() => void refresh()}>Try again</button></div>}

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="bg-background rounded-2xl shadow-card p-6">
          <h2 className="font-serif text-3xl font-semibold tracking-tight">requests</h2>
          {loading ? <Loading /> : <div className="mt-5 space-y-7">
            <RequestGroup title="incoming" empty="No one is waiting on you." requests={incoming} busy={busy} actions={(request) => <><Action label="accept" disabled={busy === request.id} onClick={() => void mutate(request.id, () => acceptFriendRequest(request.id))} /><Action label="decline" muted disabled={busy === request.id} onClick={() => void mutate(request.id, () => declineFriendRequest(request.id))} /></>} />
            <RequestGroup title="sent" empty="You have not sent any requests." requests={outgoing} busy={busy} actions={(request) => <Action label="cancel request" muted disabled={busy === request.id} onClick={() => void mutate(request.id, () => cancelFriendRequest(request.id))} />} />
          </div>}
        </section>
        <section className="bg-background rounded-2xl shadow-card p-6">
          <h2 className="font-serif text-3xl font-semibold tracking-tight">your circle</h2>
          {loading ? <Loading /> : friends.length === 0 ? <p className="mt-5 font-serif text-foreground-secondary">No friends here yet. Search a username to start.</p> : <div className="mt-5 space-y-3">{friends.map((person) => <Person key={person.id} person={person} action="remove" disabled={busy === person.id} onAction={() => void mutate(person.id, () => removeFriend(person.id))} muted />)}</div>}
        </section>
      </div>
    </section>
  );
}

function Loading() { return <p className="mt-5 font-serif text-foreground-secondary">Loading your circle...</p>; }
function Action({ label, disabled, onClick, muted = false }: { label: string; disabled: boolean; onClick: () => void; muted?: boolean }) { return <button disabled={disabled} onClick={onClick} className={`rounded-lg px-3 py-2 font-serif text-sm font-semibold disabled:opacity-50 ${muted ? "bg-background-tertiary text-foreground" : "bg-background-accent text-foreground-accent"}`}>{label}</button>; }
function Person({ person, action, disabled, onAction, muted = false }: { person: FriendCard; action: string; disabled: boolean; onAction: () => void; muted?: boolean }) { return <div className="flex items-center justify-between gap-3 rounded-xl bg-background-tertiary/60 px-4 py-3"><div className="min-w-0"><p className="truncate font-serif text-lg font-semibold">{person.displayName}</p><p className="truncate text-sm text-foreground-tertiary">@{person.username}</p></div><Action label={action} disabled={disabled} onClick={onAction} muted={muted || action !== "add friend"} /></div>; }
function RequestGroup({ title, empty, requests, actions }: { title: string; empty: string; requests: FriendRequest[]; busy: string | null; actions: (request: FriendRequest) => React.ReactNode }) { return <div><h3 className="font-serif text-lg font-semibold text-foreground-secondary">{title}</h3>{requests.length === 0 ? <p className="mt-2 text-sm text-foreground-tertiary">{empty}</p> : <div className="mt-3 space-y-3">{requests.map((request) => request.user && <div key={request.id} className="flex items-center justify-between gap-3"><div><p className="font-serif font-semibold">{request.user.displayName}</p><p className="text-sm text-foreground-tertiary">@{request.user.username}</p></div><div className="flex gap-2">{actions(request)}</div></div>)}</div>}</div>; }

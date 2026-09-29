"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { FriendCard, FriendRequest } from "@/lib/api/friends";

type Page<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };

type Props = {
  friends: Page<FriendCard>;
  incoming: Page<FriendRequest>;
  outgoing: Page<FriendRequest>;
  loading: boolean;
  busy: string | null;
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onRemove: (userId: string) => void;
  onLoadMoreFriends: () => void;
  onLoadMoreIncoming: () => void;
  onLoadMoreOutgoing: () => void;
};

/** WDCC-style local tabs. Discovery remains in the persistent navigation search. */
export function FriendsTabs({
  friends,
  incoming,
  outgoing,
  loading,
  busy,
  onAccept,
  onDecline,
  onCancel,
  onRemove,
  onLoadMoreFriends,
  onLoadMoreIncoming,
  onLoadMoreOutgoing,
}: Props) {
  const [tab, setTab] = useState<"friends" | "requests">("friends");
  const [search, setSearch] = useState("");
  const filteredFriends = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return friends.items;
    return friends.items.filter((friend) =>
      `${friend.displayName} ${friend.username}`.toLocaleLowerCase().includes(query),
    );
  }, [friends.items, search]);

  return (
    <div>
      <div className="mb-4 flex border-b border-foreground/60" role="tablist" aria-label="Friend folders">
        <Tab active={tab === "friends"} onClick={() => setTab("friends")}>Friends</Tab>
        <Tab active={tab === "requests"} onClick={() => setTab("requests")}>
          Requests
          {incoming.items.length > 0 && <span className="ml-2 inline-grid min-w-5 place-items-center rounded-full bg-foreground-accent px-1.5 py-0.5 font-sans text-xs text-white">{incoming.items.length}</span>}
        </Tab>
      </div>

      {tab === "friends" ? (
        <section aria-label="Friends">
          <label className="relative mb-4 block">
            <span className="sr-only">Search friends</span>
            <span aria-hidden className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-foreground-tertiary after:absolute after:-bottom-1.5 after:-right-1.5 after:h-2 after:w-0.5 after:rotate-[-45deg] after:bg-foreground-tertiary" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search friends..." className="w-full rounded-lg border border-foreground/10 bg-background py-2.5 pl-12 pr-3 font-sans text-sm text-foreground shadow-card outline-none placeholder:text-foreground-tertiary focus:border-foreground/25 focus:ring-2 focus:ring-accent/25" />
          </label>
          {loading ? <Loading /> : filteredFriends.length === 0 ? <p className="py-10 text-center font-sans text-sm text-foreground-tertiary">{search.trim() ? "No friends found" : "No friends yet"}</p> : <ul className="space-y-3">{filteredFriends.map((friend) => <FriendRow key={friend.id} friend={friend} busy={busy === friend.id} onRemove={onRemove} />)}</ul>}
          <More visible={friends.hasMore} onClick={onLoadMoreFriends} />
        </section>
      ) : (
        <section aria-label="Friend requests">
          {loading ? <Loading /> : incoming.items.length === 0 && outgoing.items.length === 0 ? <p className="py-10 text-center font-sans text-sm text-foreground-tertiary">No pending requests</p> : <div className="space-y-7">
            <RequestSection title="Received" requests={incoming} busy={busy} onAccept={onAccept} onDecline={onDecline} onCancel={onCancel} />
            <RequestSection title="Sent" requests={outgoing} busy={busy} onAccept={onAccept} onDecline={onDecline} onCancel={onCancel} />
          </div>}
          <More visible={incoming.hasMore} onClick={onLoadMoreIncoming} />
          <More visible={outgoing.hasMore} onClick={onLoadMoreOutgoing} />
        </section>
      )}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`flex flex-1 items-center justify-center border-b-2 py-2 font-sans text-sm font-medium transition-colors ${active ? "border-accent text-foreground" : "border-transparent text-foreground-secondary hover:text-foreground"}`}>{children}</button>;
}

function FriendRow({ friend, busy, onRemove }: { friend: FriendCard; busy: boolean; onRemove: (userId: string) => void }) {
  return <li className="flex items-center gap-3 rounded-xl border border-foreground/8 bg-background/95 p-3 shadow-card">
    <ProfileLink username={friend.username} name={friend.displayName} />
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <Link href={`/messages/new/${friend.username}`} aria-label={`Message ${friend.displayName}`} className="rounded-lg border border-foreground/15 px-2.5 py-2 font-sans text-xs font-medium text-foreground-secondary hover:border-foreground-accent hover:text-foreground-accent"><span className="hidden sm:inline">Message</span><span aria-hidden className="sm:hidden">✉</span></Link>
      <details className="group relative">
        <summary aria-label={`Relationship actions for ${friend.displayName}`} className="cursor-pointer list-none rounded-xl bg-background-accent px-3 py-2 font-serif text-sm text-foreground-accent focus:outline-none focus:ring-2 focus:ring-accent [&::-webkit-details-marker]:hidden">friends</summary>
        <div className="absolute right-0 top-full z-20 mt-2 whitespace-nowrap rounded-xl border border-foreground/10 bg-background p-1 shadow-card">
          <button type="button" disabled={busy} onClick={() => onRemove(friend.id)} className="rounded-lg px-3 py-2 font-sans text-sm text-foreground-secondary hover:bg-background-accent disabled:opacity-50">Remove friend</button>
        </div>
      </details>
    </div>
  </li>;
}

function RequestSection({ title, requests, busy, onAccept, onDecline, onCancel }: { title: "Received" | "Sent"; requests: Page<FriendRequest>; busy: string | null; onAccept: (requestId: string) => void; onDecline: (requestId: string) => void; onCancel: (requestId: string) => void }) {
  if (requests.items.length === 0) return null;
  return <section><h2 className="mb-3 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-foreground-tertiary">{title}</h2><ul className="space-y-3">{requests.items.map((request) => request.user && <li key={request.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-foreground/8 bg-background/95 p-3 shadow-card"><ProfileLink username={request.user.username} name={request.user.displayName} /><div className="ml-auto flex shrink-0 gap-2">{title === "Received" ? <><Action label="Accept" disabled={busy === request.id} onClick={() => onAccept(request.id)} /><Action label="Decline" muted disabled={busy === request.id} onClick={() => onDecline(request.id)} /></> : <Action label="Cancel" muted disabled={busy === request.id} onClick={() => onCancel(request.id)} />}</div></li>)}</ul></section>;
}

function ProfileLink({ username, name }: { username: string; name: string }) {
  const initial = (name || username).trim().slice(0, 1).toLocaleUpperCase() || "?";
  return <Link href={`/${username}`} className="flex min-w-0 items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent"><span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background-accent font-serif text-lg text-foreground-accent">{initial}</span><span className="min-w-0"><span className="block truncate font-serif text-lg font-semibold tracking-tighter">{name}</span><span className="block truncate font-sans text-sm text-foreground-tertiary">@{username}</span></span></Link>;
}

function Action({ label, disabled, onClick, muted = false }: { label: string; disabled: boolean; onClick: () => void; muted?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-xl px-3 py-2 font-sans text-sm font-medium disabled:opacity-50 ${muted ? "border border-foreground/15 text-foreground-secondary" : "bg-background-accent text-foreground-accent"}`}>{label}</button>;
}

function Loading() { return <p className="py-10 text-center font-sans text-sm text-foreground-tertiary">Loading your circle...</p>; }
function More({ visible, onClick }: { visible: boolean; onClick: () => void }) { return visible ? <button type="button" onClick={onClick} className="mt-5 font-sans text-sm font-medium text-foreground-secondary underline underline-offset-4 hover:text-foreground">load more</button> : null; }

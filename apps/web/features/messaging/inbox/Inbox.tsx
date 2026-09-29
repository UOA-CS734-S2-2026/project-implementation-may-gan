"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClientMessageId } from "../shared/client-id";
import { useCreateConversationMutation } from "@/features/messaging/create-conversation/use-create-conversation-mutation";
import { useInboxQuery } from "./use-inbox-query";
import { useSession } from "@/lib/session/hooks";
import { useMessagingLive } from "@/features/messaging/realtime/MessagingProvider";
import { loadFriends } from "@/lib/api/friends";
import { useQuery } from "@tanstack/react-query";

type Folder = "inbox" | "requests";
const validText = (text: string) => text.trim().length > 0 && Array.from(text).length <= 4_000;

export function Inbox() {
  const { user } = useSession();
  return <InboxBody key={user?.id ?? "anonymous"} />;
}

function InboxBody() {
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useSession();
  const { unread } = useMessagingLive();
  const [folder, setFolder] = useState<Folder>("inbox");
  const inbox = useInboxQuery(folder);
  const direct = useCreateConversationMutation();
  const draftRecipientId = search.get("to") ?? "";
  const draftRecipientName = search.get("name") ?? "";
  const friends = useQuery({ queryKey: ["friends", user?.id ?? "anonymous", "picker"], retry: false, queryFn: async () => { const result = await loadFriends(); if (!result.ok) throw new Error(result.failure); return result.value.items; } });
  const [recipientId, setRecipientId] = useState(draftRecipientId);
  const [firstText, setFirstText] = useState("");
  const [directIntent, setDirectIntent] = useState<{ clientMessageId: string; recipientId: string; text: string } | null>(null);
  const items = inbox.data?.pages.flatMap((page) => page.items).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index) ?? [];
  const notice = inbox.error instanceof Error ? inbox.error.message : direct.error instanceof Error ? direct.error.message : null;

  async function startDirect(event: FormEvent) {
    event.preventDefault();
    const intent = directIntent ?? { clientMessageId: createClientMessageId(), recipientId: recipientId.trim(), text: firstText };
    if (!intent.recipientId || !validText(intent.text)) return;
    setDirectIntent(intent);
    try {
      const result = await direct.mutateAsync(intent);
      setDirectIntent(null); setRecipientId(""); setFirstText("");
      router.push(`/messages/${result.conversation.id}`);
    } catch { /* The stable intent and mutation error render the explicit retry path. */ }
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 md:px-12">
      <header className="mb-8 flex items-end justify-between gap-5">
        <div><p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-foreground-tertiary">private notes</p><h1 className="mt-2 font-serif text-5xl tracking-tight text-foreground">messages</h1></div>
        <button type="button" onClick={() => void inbox.refetch()} className="rounded-full border border-foreground/15 px-4 py-2 font-sans text-sm text-foreground-secondary hover:border-foreground-accent hover:text-foreground-accent focus:outline-none focus:ring-2 focus:ring-accent" disabled={inbox.isFetching}>{inbox.isFetching ? "refreshing" : "refresh"}</button>
      </header>

      <form onSubmit={startDirect} className="mb-8 rounded-2xl border border-foreground/10 bg-background-secondary/50 p-4 shadow-card">
        <div className="flex items-center justify-between gap-3"><h2 className="font-serif text-xl">Start a private note</h2><span className="font-sans text-xs text-foreground-tertiary">friends</span></div>
        {draftRecipientId ? <p className="mt-2 font-sans text-sm text-foreground-secondary">Writing to {draftRecipientName || "this person"}.</p> : <><p className="mt-1 font-sans text-xs text-foreground-secondary">Choose a friend to start a new conversation.</p><div className="mt-3 flex flex-wrap gap-2">{friends.data?.map((friend) => <button key={friend.id} type="button" onClick={() => { setRecipientId(friend.id); setDirectIntent(null); }} className={`rounded-full border px-3 py-1.5 font-sans text-sm ${recipientId === friend.id ? "border-foreground-accent bg-background-accent text-foreground-accent" : "border-foreground/15"}`}>{friend.displayName}</button>)}{friends.isPending && <span className="text-sm text-foreground-tertiary">Loading friends…</span>}{!friends.isPending && friends.data?.length === 0 && <span className="text-sm text-foreground-tertiary">Add a friend to start a conversation here.</span>}</div></>}
        <div className="mt-3 flex gap-2"><label className="sr-only" htmlFor="first-message">First message</label><input id="first-message" value={firstText} onChange={(event) => { setFirstText(event.target.value); setDirectIntent(null); }} placeholder="Write the first message" className="min-w-0 flex-1 rounded-xl border border-foreground/15 bg-background px-3 py-2 font-sans text-sm outline-none focus:ring-2 focus:ring-accent" /><button type="submit" disabled={!recipientId.trim() || !validText(firstText) || direct.isPending} className="rounded-xl bg-foreground-accent px-4 font-serif text-sm text-white disabled:opacity-50">{directIntent ? "retry" : "start"}</button></div>
      </form>

      <div className="mb-5 flex gap-2 border-b border-foreground/10" role="tablist" aria-label="Message folders">
        {(["inbox", "requests"] as const).map((entry) => {
          const count = entry === "inbox" ? unread.inboxCount : unread.requestCount;
          return <button key={entry} type="button" role="tab" aria-label={`${entry} ${count}`} aria-selected={folder === entry} onClick={() => setFolder(entry)} className={`border-b-2 px-3 py-2 font-sans text-sm capitalize ${folder === entry ? "border-foreground-accent text-foreground-accent" : "border-transparent text-foreground-secondary"}`}>{entry}{count > 0 && <span className="ml-2 rounded-full bg-foreground-accent px-1.5 py-0.5 text-xs text-white">{count}</span>}</button>;
        })}
      </div>
      {inbox.isError && <p role="status" className="mb-5 rounded-2xl bg-background-accent px-4 py-3 font-sans text-sm text-foreground-secondary">{notice} Manual refresh is available when updates resume.</p>}
      {!inbox.isLoading && !inbox.isError && items.length === 0 && <div className="border-y border-foreground/10 py-16 text-center"><p className="font-serif text-2xl">No {folder === "requests" ? "requests" : "conversations"} yet.</p></div>}
      <ul className="divide-y divide-foreground/10 border-y border-foreground/10">
        {items.map((conversation) => <li key={conversation.id}><Link href={`/messages/${conversation.id}`} className="group flex items-center gap-4 px-2 py-5 hover:bg-background-secondary/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"><span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-background-accent font-serif text-lg text-foreground-accent">{(conversation.peer.name ?? "?").slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong className="font-serif text-lg font-semibold">{conversation.peer.name ?? "conversation"}</strong>{conversation.unreadCount > 0 && <em className="rounded-full bg-foreground-accent px-2 py-0.5 font-sans text-xs not-italic text-white">{conversation.unreadCount}</em>}</span><span className="mt-1 block truncate font-sans text-sm text-foreground-secondary">{conversation.latestMessage?.text ?? "Message removed"}</span></span></Link></li>)}
      </ul>
      {inbox.hasNextPage && <button type="button" onClick={() => void inbox.fetchNextPage()} disabled={inbox.isFetchingNextPage} className="mt-5 rounded-full border border-foreground/15 px-4 py-2 font-sans text-sm hover:border-foreground-accent">load older conversations</button>}
      {notice && !inbox.isError && <p role="status" className="mt-4 font-sans text-sm text-foreground-secondary">{notice}</p>}
    </section>
  );
}

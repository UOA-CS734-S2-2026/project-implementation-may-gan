"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { messagingApi, type MessagingConversation } from "@/lib/api/messaging";

export function Inbox() {
  const [conversations, setConversations] = useState<MessagingConversation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "paused">("loading");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    const result = await messagingApi.inbox();
    if (result.ok) {
      setConversations(result.value.items);
      setStatus("ready"); setMessage(null);
    } else {
      setStatus("paused"); setMessage(result.message);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="mx-auto max-w-3xl px-6 py-16 md:px-12">
      <header className="mb-10 flex items-end justify-between gap-5">
        <div>
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-foreground-tertiary">private notes</p>
          <h1 className="mt-2 font-serif text-5xl tracking-tight text-foreground">messages</h1>
        </div>
        <button type="button" onClick={() => void refresh()} className="rounded-full border border-foreground/15 px-4 py-2 font-sans text-sm text-foreground-secondary hover:border-foreground-accent hover:text-foreground-accent focus:outline-none focus:ring-2 focus:ring-accent" disabled={status === "loading"}>
          {status === "loading" ? "refreshing" : "refresh"}
        </button>
      </header>
      {status === "paused" && <p role="status" className="mb-5 rounded-2xl bg-background-accent px-4 py-3 font-sans text-sm text-foreground-secondary">{message} Manual refresh is available when updates resume.</p>}
      {status === "ready" && conversations.length === 0 && (
        <div className="border-y border-foreground/10 py-16 text-center"><p className="font-serif text-2xl">No conversations yet.</p><p className="mt-2 font-sans text-sm text-foreground-secondary">Start from someone&apos;s profile when you have their user ID.</p></div>
      )}
      <ul className="divide-y divide-foreground/10 border-y border-foreground/10">
        {conversations.map((conversation) => (
          <li key={conversation.id}>
            <Link href={`/messages/${conversation.id}`} className="group flex items-center gap-4 px-2 py-5 hover:bg-background-secondary/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent">
              <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-background-accent font-serif text-lg text-foreground-accent">{(conversation.peer.name ?? "?").slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong className="font-serif text-lg font-semibold">{conversation.peer.name ?? "conversation"}</strong>{conversation.unreadCount > 0 && <em className="rounded-full bg-foreground-accent px-2 py-0.5 font-sans text-xs not-italic text-white">{conversation.unreadCount}</em>}</span><span className="mt-1 block truncate font-sans text-sm text-foreground-secondary">{conversation.latestMessage?.text ?? "Message removed"}</span></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

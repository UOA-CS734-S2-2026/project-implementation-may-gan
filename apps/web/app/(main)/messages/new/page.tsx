"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session/hooks";
import { loadFriends, type RelationshipUserPage } from "@/lib/api/friends";

/** Start-conversation entry point. Only established friends appear here. */
export default function NewConversationPickerPage() {
  const { user } = useSession();
  const friends = useInfiniteQuery<RelationshipUserPage, Error, import("@tanstack/react-query").InfiniteData<RelationshipUserPage>, readonly string[], string | undefined>({ queryKey: ["friends", user?.id ?? "anonymous", "draft-picker"], initialPageParam: undefined, getNextPageParam: (page) => page.nextCursor ?? undefined, queryFn: async ({ pageParam }) => { const result = await loadFriends(pageParam); if (!result.ok) throw new Error(result.failure); return result.value; } });
  const items = friends.data?.pages.flatMap((page) => page.items) ?? [];
  return <main className="mx-auto max-w-2xl px-6 py-12"><Link href="/messages" className="font-sans text-sm text-foreground-secondary">← all messages</Link><h1 className="mt-5 font-serif text-4xl tracking-tight">new message</h1><p className="mt-2 font-sans text-sm text-foreground-secondary">Choose a friend to begin a private note.</p><ul className="mt-7 divide-y divide-foreground/10 border-y border-foreground/10">{items.map((friend) => <li key={friend.id}><Link href={`/messages/new/${friend.username}`} className="flex items-center justify-between py-4 hover:text-foreground-accent"><span><strong className="font-serif text-lg">{friend.displayName}</strong><span className="ml-2 font-sans text-sm text-foreground-tertiary">@{friend.username}</span></span><span aria-hidden>→</span></Link></li>)}</ul>{friends.isPending && <p className="mt-5 font-sans text-sm text-foreground-secondary">Loading friends…</p>}{friends.isError && <div role="alert" className="mt-5 font-sans text-sm text-foreground-secondary">Could not load friends. <button type="button" onClick={() => void friends.refetch()} className="underline">Retry</button></div>}{!friends.isPending && !friends.isError && items.length === 0 && <p className="mt-8 font-serif text-lg text-foreground-secondary">Add a friend to start a conversation here.</p>}{friends.hasNextPage && <button type="button" onClick={() => void friends.fetchNextPage()} disabled={friends.isFetchingNextPage} className="mt-5 rounded-full border border-foreground/15 px-4 py-2 font-sans text-sm">{friends.isFetchingNextPage ? "loading…" : "more friends"}</button>}</main>;
}

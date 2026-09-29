"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session/hooks";
import { useMessagingLive } from "@/features/messaging/realtime/MessagingProvider";
import { messagingApi } from "../shared/messaging.api";
import { messagingKeys } from "../shared/messaging.keys";
import { ConversationList } from "./ConversationList";
import { useInboxQuery } from "./use-inbox-query";

type Folder = "inbox" | "requests";

export function Inbox() {
  const { user } = useSession();
  return <InboxBody key={user?.id ?? "anonymous"} />;
}

function InboxBody() {
  const { user } = useSession();
  const { unread, refreshUnread } = useMessagingLive();
  const queryClient = useQueryClient();
  const [folder, setFolder] = useState<Folder>("inbox");
  const inbox = useInboxQuery(folder);
  const resolve = useMutation({
    mutationFn: async ({ conversationId, decision }: { conversationId: string; decision: "accept" | "decline" }) => {
      const result = await messagingApi.resolveRequest(conversationId, decision);
      if (!result.ok) throw new Error(result.message);
      return result.value;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messagingKeys.root(user?.id ?? "anonymous") });
      void refreshUnread();
    },
  });
  const items = inbox.data?.pages.flatMap((page) => page.items).filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index) ?? [];
  const notice = inbox.error instanceof Error ? inbox.error.message : resolve.error instanceof Error ? resolve.error.message : null;

  return <section className="mx-auto w-full max-w-2xl px-5 py-12 md:px-8 md:py-16">
    <header className="mb-9 text-center">
      <h1 className="font-serif text-5xl font-semibold tracking-tighter text-foreground md:text-6xl">messages</h1>
      <Link href="/messages/new" className="mt-3 inline-block font-sans text-sm font-medium text-foreground-secondary underline underline-offset-4 hover:text-foreground">new message</Link>
    </header>

    <div className="mb-7 flex border-b-2 border-foreground/90" role="tablist" aria-label="Message folders">
      <Tab active={folder === "inbox"} onClick={() => setFolder("inbox")}>Messages{unread.inboxCount > 0 && <Count count={unread.inboxCount} />}</Tab>
      <Tab active={folder === "requests"} onClick={() => setFolder("requests")}>Requests{unread.requestCount > 0 && <Count count={unread.requestCount} />}</Tab>
    </div>

    {inbox.isLoading ? <p className="py-16 text-center font-sans text-sm text-foreground-tertiary">Loading messages...</p> : inbox.isError ? <p role="status" className="rounded-2xl border border-foreground/10 bg-background px-5 py-4 font-sans text-sm text-foreground-secondary">{notice} <button type="button" onClick={() => void inbox.refetch()} className="font-medium underline underline-offset-4">Try again</button></p> : <ConversationList conversations={items} folder={folder} resolvingId={resolve.isPending ? resolve.variables?.conversationId ?? null : null} onResolve={(conversationId, decision) => resolve.mutate({ conversationId, decision })} />}
    {inbox.hasNextPage && <button type="button" onClick={() => void inbox.fetchNextPage()} disabled={inbox.isFetchingNextPage} className="mt-5 font-sans text-sm font-medium text-foreground-secondary underline underline-offset-4 disabled:opacity-50">{inbox.isFetchingNextPage ? "loading..." : "load older conversations"}</button>}
    {notice && !inbox.isError && <p role="status" className="mt-4 font-sans text-sm text-foreground-secondary">{notice}</p>}
  </section>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`flex flex-1 items-center justify-center border-b-4 py-3 font-sans text-xl font-medium transition-colors ${active ? "border-accent text-foreground" : "border-transparent text-foreground-secondary hover:text-foreground"}`}>{children}</button>;
}
function Count({ count }: { count: number }) { return <span className="ml-2 inline-grid min-w-5 place-items-center rounded-full bg-foreground-accent px-1.5 py-0.5 font-sans text-xs text-white">{count}</span>; }

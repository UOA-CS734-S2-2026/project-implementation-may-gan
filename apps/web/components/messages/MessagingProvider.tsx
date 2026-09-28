"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { messagingApi, type MessagingChange } from "@/lib/api/messaging";
import { MessagingRealtime, type ConversationChangedEvent } from "@/lib/messaging/realtime";
import { useSession } from "@/lib/session/hooks";

interface MessagingLiveState {
  revision: number;
  unread: { inboxCount: number; requestCount: number };
  changesFor(conversationId: string): MessagingChange[];
  refreshUnread(): Promise<void>;
}

const MessagingLiveContext = createContext<MessagingLiveState>({
  revision: 0,
  unread: { inboxCount: 0, requestCount: 0 },
  changesFor: () => [],
  refreshUnread: async () => {},
});

/** Mount once per signed-in account. Socket events invalidate durable REST state, never poll. */
export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  return <MessagingProviderContent key={session?.id ?? "anonymous"}>{children}</MessagingProviderContent>;
}

function MessagingProviderContent({ children }: { children: React.ReactNode }) {
  const { session, isPending } = useSession();
  const [revision, setRevision] = useState(0);
  const [unread, setUnread] = useState({ inboxCount: 0, requestCount: 0 });
  const changes = useRef(new Map<string, MessagingChange[]>());
  const lastChange = useRef(new Map<string, string>());

  const refreshUnread = useCallback(async () => {
    const result = await messagingApi.unread();
    if (result.ok) setUnread(result.value);
  }, []);

  useEffect(() => {
    changes.current.clear();
    lastChange.current.clear();
    if (isPending || !session?.id) {
      void Promise.resolve().then(() => setUnread({ inboxCount: 0, requestCount: 0 }));
      return;
    }

    void Promise.resolve().then(() => setUnread({ inboxCount: 0, requestCount: 0 }));
    const reconcile = async (event: ConversationChangedEvent) => {
      let cursor = lastChange.current.get(event.conversationId) ?? "0";
      const received: MessagingChange[] = [];
      while (true) {
        const page = await messagingApi.changes(event.conversationId, cursor);
        if (!page.ok) return;
        received.push(...page.value.items);
        cursor = page.value.nextChangeSequence ?? page.value.highWatermark;
        lastChange.current.set(event.conversationId, page.value.highWatermark);
        if (!page.value.hasMore) break;
      }
      if (received.length) {
        const existing = changes.current.get(event.conversationId) ?? [];
        const unique = new Map(existing.map((change) => [change.changeSequence, change]));
        received.forEach((change) => unique.set(change.changeSequence, change));
        changes.current.set(event.conversationId, [...unique.values()]);
      }
      await refreshUnread();
      setRevision((value) => value + 1);
    };

    const realtime = new MessagingRealtime({
      issueTicket: messagingApi.realtimeTicket,
      onReady: async () => { await refreshUnread(); setRevision((value) => value + 1); },
      onChange: reconcile,
    });
    void Promise.resolve().then(refreshUnread);
    void realtime.start();
    const foreground = () => { if (document.visibilityState === "visible") void realtime.resume(); };
    document.addEventListener("visibilitychange", foreground);
    return () => { document.removeEventListener("visibilitychange", foreground); realtime.stop(); };
  }, [isPending, refreshUnread, session?.id]);

  const value = useMemo(() => ({
    revision,
    unread,
    refreshUnread,
    changesFor: (conversationId: string) => changes.current.get(conversationId) ?? [],
  }), [refreshUnread, revision, unread]);
  return <MessagingLiveContext.Provider value={value}>{children}</MessagingLiveContext.Provider>;
}

export function useMessagingLive() { return useContext(MessagingLiveContext); }
export function useMessagingLiveRevision() { return useMessagingLive().revision; }

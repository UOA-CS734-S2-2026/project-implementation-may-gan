"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { messagingApi } from "@/lib/api/messaging";
import { MessagingRealtime, type ConversationChangedEvent } from "@/lib/messaging/realtime";
import { useSession } from "@/lib/session/hooks";

interface MessagingLiveState { revision: number; }
const MessagingLiveContext = createContext<MessagingLiveState>({ revision: 0 });

/** Mount once for signed-in screens. Socket events only trigger REST reconciliation. */
export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { session, isPending } = useSession();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (isPending || !session?.id) return;
    const lastChange = new Map<string, string>();
    const reconcile = async (event: ConversationChangedEvent) => {
      let cursor = lastChange.get(event.conversationId) ?? "0";
      while (true) {
        const changes = await messagingApi.changes(event.conversationId, cursor);
        if (!changes.ok) return;
        cursor = changes.value.nextChangeSequence ?? changes.value.highWatermark;
        lastChange.set(event.conversationId, changes.value.highWatermark);
        if (!changes.value.hasMore) break;
      }
      setRevision((value) => value + 1);
    };
    const realtime = new MessagingRealtime({
      issueTicket: messagingApi.realtimeTicket,
      onReady: async () => setRevision((value) => value + 1),
      onChange: reconcile,
    });
    void realtime.start();
    const foreground = () => { if (document.visibilityState === "visible") void realtime.resume(); };
    document.addEventListener("visibilitychange", foreground);
    return () => { document.removeEventListener("visibilitychange", foreground); realtime.stop(); };
  }, [isPending, session?.id]);
  const value = useMemo(() => ({ revision }), [revision]);
  return <MessagingLiveContext.Provider value={value}>{children}</MessagingLiveContext.Provider>;
}

export function useMessagingLiveRevision() { return useContext(MessagingLiveContext).revision; }

"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { messagingApi, type MessagingChange } from "@/features/messaging/shared/messaging.api";
import { messagingKeys } from "@/features/messaging/shared/messaging.keys";
import { type LocalMessagingMessage, mergeMessageIntoPages, updateMessagePages } from "@/features/messaging/shared/message-cache";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useUnreadQuery } from "@/features/messaging/shared/use-unread-query";
import { MessagingRealtime, type ConversationChangedEvent } from "./MessagingRealtime";
import { useSession } from "@/lib/session/hooks";

interface MessagingLiveState {
  revision: number;
  unread: { inboxCount: number; requestCount: number };
  changesFor(conversationId: string): MessagingChange[];
  refreshUnread(): Promise<void>;
}

const MessagingLiveContext = createContext<MessagingLiveState>({ revision: 0, unread: { inboxCount: 0, requestCount: 0 }, changesFor: () => [], refreshUnread: async () => {} });

/** A fresh client is mounted for each account, so private queries and in-flight requests cannot cross sessions. */
export function MessagingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  return <MessagingQueryScope key={user?.id ?? "anonymous"}>{children}</MessagingQueryScope>;
}

function MessagingQueryScope({ children }: { children: React.ReactNode }) {
  return <QueryProvider><MessagingProviderContent>{children}</MessagingProviderContent></QueryProvider>;
}

function MessagingProviderContent({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useSession();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "anonymous";
  const unreadQuery = useUnreadQuery();
  const [revision, setRevision] = useState(0);
  const changes = useRef(new Map<string, MessagingChange[]>());
  const lastChange = useRef(new Map<string, string>());
  const reconciliation = useRef(new Map<string, Promise<void>>());

  const refreshUnread = useCallback(async () => {
    if (userId === "anonymous") return;
    await queryClient.refetchQueries({ queryKey: messagingKeys.unread(userId), type: "active" });
  }, [queryClient, userId]);

  useEffect(() => {
    changes.current.clear(); lastChange.current.clear(); reconciliation.current.clear();
    if (isPending || !user?.id) return;
    let active = true;
    const applyChanges = async (event: ConversationChangedEvent) => {
      let cursor = lastChange.current.get(event.conversationId) ?? "0";
      while (active) {
        const page = unwrapMessagingResult(await messagingApi.changes(event.conversationId, cursor));
        const received = page.items;
        // Fetch canonical projections before recording the durable cursor. A failed projection is retried on the next socket/reconnect signal.
        const projected = await Promise.all(received.filter((change) => change.messageId).map(async (change) => unwrapMessagingResult(await messagingApi.message(event.conversationId, change.messageId as string))));
        if (!active) return;
        for (const message of projected) updateMessagePages(queryClient, user.id, event.conversationId, (data) => mergeMessageIntoPages(data, [message as LocalMessagingMessage]) ?? data);
        if (received.length) {
          const existing = changes.current.get(event.conversationId) ?? [];
          const unique = new Map(existing.map((change) => [change.changeSequence, change]));
          received.forEach((change) => unique.set(change.changeSequence, change));
          changes.current.set(event.conversationId, [...unique.values()]);
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: messagingKeys.conversation(user.id, event.conversationId) }),
          queryClient.invalidateQueries({ queryKey: messagingKeys.inbox(user.id, "inbox") }),
          queryClient.invalidateQueries({ queryKey: messagingKeys.inbox(user.id, "requests") }),
          queryClient.invalidateQueries({ queryKey: messagingKeys.unread(user.id) }),
        ]);
        if (!active) return;
        lastChange.current.set(event.conversationId, page.highWatermark);
        setRevision((value) => value + 1);
        if (!page.hasMore) return;
        cursor = page.nextChangeSequence ?? page.highWatermark;
      }
    };
    const reconcile = (event: ConversationChangedEvent) => {
      const previous = reconciliation.current.get(event.conversationId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(() => applyChanges(event)).catch(() => undefined);
      reconciliation.current.set(event.conversationId, next);
      return next;
    };
    const realtime = new MessagingRealtime({
      issueTicket: messagingApi.realtimeTicket,
      onReady: async () => { await refreshUnread(); if (active) setRevision((value) => value + 1); },
      onChange: reconcile,
    });
    void refreshUnread(); void realtime.start();
    const foreground = () => { if (document.visibilityState === "visible") void realtime.resume(); };
    document.addEventListener("visibilitychange", foreground);
    return () => { active = false; document.removeEventListener("visibilitychange", foreground); realtime.stop(); };
  }, [isPending, queryClient, refreshUnread, user?.id]);

  const value = useMemo(() => ({ revision, unread: userId === "anonymous" ? { inboxCount: 0, requestCount: 0 } : (unreadQuery.data ?? { inboxCount: 0, requestCount: 0 }), refreshUnread, changesFor: (conversationId: string) => changes.current.get(conversationId) ?? [] }), [refreshUnread, revision, unreadQuery.data, userId]);
  return <MessagingLiveContext.Provider value={value}>{children}</MessagingLiveContext.Provider>;
}

export function useMessagingLive() { return useContext(MessagingLiveContext); }
export function useMessagingLiveRevision() { return useMessagingLive().revision; }

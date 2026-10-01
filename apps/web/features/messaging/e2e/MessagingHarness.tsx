"use client";

import { useState } from "react";
import { MessageBubble } from "../shared/MessageBubble";
import type { MessagingMessage, Reaction } from "../shared/messaging.api";

const seed: MessagingMessage[] = [
  {
    id: "received", conversationId: "e2e", sequence: "1", senderId: "ada", clientMessageId: "received-client", text: "A real message", replyToMessageId: null, replyPreview: null, version: 1, createdAt: "2026-09-30T19:55:00.000Z", editedAt: null, unsentAt: null,
    reactions: [{ reaction: "love", count: 2, reactedByActor: true, reactors: [{ id: "me", name: "Me" }, { id: "ada", name: "Ada" }] }],
  },
  {
    id: "sent", conversationId: "e2e", sequence: "2", senderId: "me", clientMessageId: "sent-client", text: "My reply", replyToMessageId: null, replyPreview: null, version: 1, createdAt: "2026-09-30T19:56:00.000Z", editedAt: null, unsentAt: null,
    reactions: [],
  },
];

export function MessagingHarness() {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState(seed);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);


  function refresh() {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 650);
  }

  function simulateSlowFetch() {
    setLoading(true);
    window.setTimeout(() => setLoading(false), 650);
  }

  function react(message: MessagingMessage, reaction: Reaction) {
    setMessages((current) => current.map((item) => {
      if (item.id !== message.id) return item;
      const currentOwn = item.reactions.find((summary) => summary.reactedByActor);
      if (currentOwn?.reaction === reaction) {
        return { ...item, reactions: item.reactions.flatMap((summary) => summary.reaction !== reaction ? [summary] : summary.count === 1 ? [] : [{ ...summary, count: summary.count - 1, reactedByActor: false, reactors: summary.reactors?.filter((actor) => actor.id !== "me") }]) };
      }
      const withoutOwn = item.reactions.flatMap((summary) => {
        if (!summary.reactedByActor) return [summary];
        return summary.count === 1 ? [] : [{ ...summary, count: summary.count - 1, reactedByActor: false, reactors: summary.reactors?.filter((actor) => actor.id !== "me") }];
      });
      const matching = withoutOwn.find((summary) => summary.reaction === reaction);
      return {
        ...item,
        reactions: matching
          ? withoutOwn.map((summary) => summary.reaction === reaction ? { ...summary, count: summary.count + 1, reactedByActor: true, reactors: [...(summary.reactors ?? []), { id: "me", name: "Me" }] } : summary)
          : [...withoutOwn, { reaction, count: 1, reactedByActor: true, reactors: [{ id: "me", name: "Me" }] }],
      };
    }));
  }

  function heart(message: MessagingMessage) {
    if (!message.reactions.some((summary) => summary.reaction === "love" && summary.reactedByActor)) react(message, "love");
  }

  return <main className="mx-auto max-w-3xl p-8">
    <h1 className="font-serif text-3xl">Messaging browser harness</h1>
    <div className="mt-4 flex gap-2"><button type="button" onClick={refresh} className="rounded-xl border px-3 py-2" disabled={refreshing}>{refreshing ? "Refreshing" : "Refresh"}</button><button type="button" onClick={simulateSlowFetch} className="rounded-xl border px-3 py-2">Simulate slow fetch</button></div>
    <section className="mt-6" aria-label="Conversation list">
      {loading ? <div aria-label="Loading conversations" className="space-y-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="flex gap-3"><span className="message-skeleton message-skeleton-avatar" /><span className="flex-1 space-y-2"><span className="message-skeleton message-skeleton-line block w-1/3" /><span className="message-skeleton message-skeleton-line block w-2/3" /></span></div>)}</div> : <p>Conversation with Ada, A real message</p>}
    </section>
    <section className="mt-8 min-h-80 space-y-5" aria-label="Message thread">
      {loading ? <div aria-label="Loading messages" className="space-y-4"><div className="message-skeleton message-skeleton-bubble" /><div className="message-skeleton message-skeleton-bubble ml-auto" /></div> : messages.map((message) => <MessageBubble key={message.id} message={message} own={message.senderId === "me"} canInteract canUnsend canEdit receiptSequence="0" onReply={(selected) => setReplyingTo(selected.text)} onEdit={() => undefined} onUnsend={() => undefined} onReaction={react} onHeart={heart} />)}
      {replyingTo && <p role="status">Replying to: {replyingTo}</p>}
    </section>
  </main>;
}

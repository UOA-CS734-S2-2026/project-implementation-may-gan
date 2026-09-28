"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { messagingApi, type MessagingConversation, type MessagingMessage, type Reaction } from "@/lib/api/messaging";
import { createClientMessageId } from "@/lib/messaging/client-id";
import { mergeMessages } from "@/lib/messaging/reconcile";
import { useSession } from "@/lib/session/hooks";
import { MessageBubble } from "./MessageBubble";
import { useMessagingLive } from "./MessagingProvider";

type LocalMessage = MessagingMessage & { delivery?: "pending" | "failed"; retryIntent?: { clientMessageId: string; text: string; replyToMessageId?: string } };
const validText = (value: string) => value.trim().length > 0 && Array.from(value).length <= 4_000;

export function Conversation({ conversationId }: { conversationId: string }) {
  const { user } = useSession();
  return <ConversationBody key={`${user?.id ?? "anonymous"}:${conversationId}`} conversationId={conversationId} />;
}

function ConversationBody({ conversationId }: { conversationId: string }) {
  const { user } = useSession();
  const { revision, changesFor, refreshUnread } = useMessagingLive();
  const [conversation, setConversation] = useState<MessagingConversation | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const [editing, setEditing] = useState<MessagingMessage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const handledChanges = useRef(new Set<string>());
  const readThrough = useRef("0");
  const readTarget = useRef<HTMLDivElement | null>(null);

  const loadInitial = useCallback(async () => {
    const [conversationResult, pageResult] = await Promise.all([messagingApi.conversation(conversationId), messagingApi.messages(conversationId)]);
    if (conversationResult.ok) { setConversation(conversationResult.value); readThrough.current = conversationResult.value.lastReadSequence; }
    else setNotice(conversationResult.message);
    if (pageResult.ok) {
      setMessages((current) => mergeMessages(current, pageResult.value.items) as LocalMessage[]);
      setOlderCursor(pageResult.value.nextCursor); setHasMore(pageResult.value.hasMore); setNotice(null);
    } else setNotice(pageResult.message);
  }, [conversationId]);

  useEffect(() => {
    handledChanges.current.clear(); readThrough.current = "0";
    void Promise.resolve().then(() => {
      setConversation(null); setMessages([]); setOlderCursor(null); setHasMore(false); setReplyTo(null); setEditing(null);
      void loadInitial();
    });
  }, [conversationId, loadInitial, user?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const reconcile = async () => {
      const changes = changesFor(conversationId).filter((change) => !handledChanges.current.has(change.changeSequence));
      if (!changes.length) {
        const [latest, currentConversation] = await Promise.all([messagingApi.messages(conversationId), messagingApi.conversation(conversationId)]);
        if (latest.ok) setMessages((current) => mergeMessages(current, latest.value.items) as LocalMessage[]);
        if (currentConversation.ok) setConversation(currentConversation.value);
        return;
      }
      changes.forEach((change) => handledChanges.current.add(change.changeSequence));
      const [latest, updated] = await Promise.all([
        messagingApi.messages(conversationId),
        Promise.all(changes.filter((change) => change.messageId).map((change) => messagingApi.message(conversationId, change.messageId as string))),
      ]);
      if (latest.ok) {
        setMessages((current) => mergeMessages(current, latest.value.items) as LocalMessage[]);
        setOlderCursor(latest.value.nextCursor); setHasMore(latest.value.hasMore);
      }
      const canonical = updated.filter((result): result is { ok: true; value: MessagingMessage } => result.ok).map((result) => result.value);
      if (canonical.length) setMessages((current) => mergeMessages(current, canonical) as LocalMessage[]);
      const currentConversation = await messagingApi.conversation(conversationId);
      if (currentConversation.ok) setConversation(currentConversation.value);
    };
    void reconcile();
  }, [changesFor, conversationId, revision]);

  useEffect(() => {
    const target = readTarget.current;
    if (!target || !conversation || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting) || document.visibilityState !== "visible") return;
      const incoming = [...messages].reverse().find((message) => message.senderId !== user?.id && !message.delivery);
      if (!incoming || BigInt(incoming.sequence) <= BigInt(readThrough.current)) return;
      void messagingApi.markRead(conversationId, incoming.sequence).then((result) => {
        if (!result.ok) return;
        readThrough.current = result.value.lastReadSequence;
        setConversation((current) => current ? { ...current, lastReadSequence: result.value.lastReadSequence, receiptSequence: result.value.receiptSequence, unreadCount: result.value.unreadCount } : current);
        void refreshUnread();
      });
    }, { threshold: 0.6 });
    observer.observe(target);
    return () => observer.disconnect();
  }, [conversation, conversationId, messages, refreshUnread, user?.id]);

  const replaceMessage = useCallback((message: MessagingMessage) => setMessages((current) => mergeMessages(current.filter((entry) => entry.id !== message.id), [message]) as LocalMessage[]), []);

  async function loadOlder() {
    if (!olderCursor) return;
    const result = await messagingApi.messages(conversationId, olderCursor);
    if (!result.ok) return setNotice(result.message);
    setMessages((current) => mergeMessages(current, result.value.items) as LocalMessage[]);
    setOlderCursor(result.value.nextCursor); setHasMore(result.value.hasMore);
  }

  async function deliver(intent: { clientMessageId: string; text: string; replyToMessageId?: string }) {
    const result = await messagingApi.send(conversationId, intent.clientMessageId, intent.text, intent.replyToMessageId);
    if (result.ok) {
      setMessages((current) => mergeMessages(current.filter((message) => message.clientMessageId !== intent.clientMessageId), [result.value]) as LocalMessage[]);
      setReplyTo(null); setNotice(null); await refreshUnread();
    } else {
      setMessages((current) => current.map((message) => message.clientMessageId === intent.clientMessageId ? { ...message, delivery: "failed", retryIntent: intent } : message));
      setNotice(result.message);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!validText(text) || !conversation?.capabilities.canSend) return;
    const intent = { clientMessageId: createClientMessageId(), text, ...(replyTo ? { replyToMessageId: replyTo.id } : {}) };
    const pending: LocalMessage = { id: `pending:${intent.clientMessageId}`, conversationId, sequence: "999999999999999999", senderId: user?.id ?? "", clientMessageId: intent.clientMessageId, text: intent.text, replyToMessageId: intent.replyToMessageId ?? null, replyPreview: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, text: replyTo.text, unsentAt: replyTo.unsentAt } : null, version: 0, createdAt: new Date().toISOString(), editedAt: null, unsentAt: null, reactions: [], delivery: "pending", retryIntent: intent };
    setMessages((current) => [...current, pending]); setText(""); setNotice(null);
    await deliver(intent);
  }

  async function retry(message: LocalMessage) {
    if (!message.retryIntent) return;
    setMessages((current) => current.map((entry) => entry.id === message.id ? { ...entry, delivery: "pending" } : entry));
    await deliver(message.retryIntent);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !validText(text)) return;
    const result = await messagingApi.edit(conversationId, editing.id, text, editing.version);
    if (result.ok) { replaceMessage(result.value); setEditing(null); setText(""); }
    else setNotice(result.failure === "conflict" ? "That message changed. Refreshing its current version." : result.message);
    if (!result.ok && result.failure === "conflict") { const current = await messagingApi.message(conversationId, editing.id); if (current.ok) replaceMessage(current.value); }
  }

  async function unsend(message: MessagingMessage) {
    const result = await messagingApi.unsend(conversationId, message.id);
    if (result.ok) replaceMessage(result.value); else setNotice(result.message);
  }

  async function react(message: MessagingMessage, reaction: Reaction) {
    const current = message.reactions.find((item) => item.reaction === reaction);
    const result = current?.reactedByActor ? await messagingApi.removeReaction(conversationId, message.id) : await messagingApi.react(conversationId, message.id, reaction);
    if (result.ok) replaceMessage(result.value); else setNotice(result.message);
  }

  async function resolve(decision: "accept" | "decline") {
    const result = await messagingApi.resolveRequest(conversationId, decision);
    if (result.ok) { setConversation(result.value); await refreshUnread(); }
    else setNotice(result.message);
  }

  function beginEdit(message: MessagingMessage) { setEditing(message); setReplyTo(null); setText(message.text ?? ""); }
  function beginReply(message: MessagingMessage) { setReplyTo(message); setEditing(null); }
  const canInteract = Boolean(conversation?.capabilities.canSend && conversation.requestState === "active");
  const incoming = [...messages].reverse().find((message) => message.senderId !== user?.id && !message.delivery);

  return <section className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10 md:px-12">
    <header className="border-b border-foreground/10 pb-5"><Link className="font-sans text-sm text-foreground-secondary hover:text-foreground-accent" href="/messages">← all messages</Link><h1 className="mt-3 font-serif text-3xl">{conversation?.peer.name ?? "conversation"}</h1>{conversation?.requestState === "pending" && <p className="mt-2 font-sans text-sm text-foreground-secondary">Message request. Actions stay private until it is accepted.</p>}{conversation && !conversation.capabilities.canSend && <p className="mt-2 font-sans text-sm text-foreground-secondary">New actions are unavailable in this conversation.</p>}</header>
    {conversation?.capabilities.canResolveRequest && <div className="mt-4 flex gap-2"><button type="button" onClick={() => void resolve("accept")} className="rounded-xl bg-foreground-accent px-4 py-2 font-serif text-sm text-white">accept request</button><button type="button" onClick={() => void resolve("decline")} className="rounded-xl border border-foreground/20 px-4 py-2 font-serif text-sm">decline</button></div>}
    <div className="flex-1 space-y-4 py-8" aria-live="polite">{hasMore && <button type="button" onClick={() => void loadOlder()} className="mx-auto block rounded-full border border-foreground/15 px-4 py-2 font-sans text-sm hover:border-foreground-accent">load older messages</button>}{messages.map((message) => <div key={message.id}>{message.delivery && <div className="mb-1 flex justify-end gap-2 font-sans text-xs text-foreground-secondary"><span>{message.delivery === "failed" ? "not sent" : "sending"}</span>{message.delivery === "failed" && <button type="button" onClick={() => void retry(message)} className="underline">retry</button>}</div>}<MessageBubble message={message} own={message.senderId === user?.id} canInteract={canInteract} canEdit={now > 0 && now < new Date(message.createdAt).getTime() + 15 * 60 * 1_000} receiptSequence={conversation?.receiptSequence ?? "0"} onReply={beginReply} onEdit={beginEdit} onUnsend={(entry) => void unsend(entry)} onReaction={(entry, reaction) => void react(entry, reaction)} /></div>)}{incoming && <div ref={readTarget} aria-label="Messages visible" className="h-px" />}</div>
    {notice && <p role="status" className="mb-3 font-sans text-sm text-foreground-secondary">{notice}</p>}
    {replyTo && <div className="flex items-center justify-between border-t border-foreground/10 px-2 py-2 font-sans text-xs text-foreground-secondary">Replying to: {replyTo.text ?? "Message removed"}<button type="button" onClick={() => setReplyTo(null)} className="underline">cancel</button></div>}
    {editing && <div className="flex items-center justify-between border-t border-foreground/10 px-2 py-2 font-sans text-xs text-foreground-secondary">Editing message, changes are allowed for 15 minutes.<button type="button" onClick={() => { setEditing(null); setText(""); }} className="underline">cancel</button></div>}
    <form onSubmit={editing ? saveEdit : send} className="sticky bottom-4 flex gap-2 rounded-2xl border border-foreground/15 bg-background p-2 shadow-card"><label className="sr-only" htmlFor="message-text">Message</label><textarea id="message-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={8000} rows={1} disabled={!editing && !conversation?.capabilities.canSend} className="min-h-11 flex-1 resize-none bg-transparent px-3 py-2 font-sans text-sm outline-none disabled:opacity-50" placeholder={editing ? "Edit message" : conversation?.capabilities.canSend ? "Write a message" : "Messaging is unavailable"}/><button type="submit" disabled={!validText(text) || (!editing && !conversation?.capabilities.canSend)} className="rounded-xl bg-foreground-accent px-4 font-serif text-sm text-white disabled:opacity-50">{editing ? "save" : "send"}</button></form>
  </section>;
}

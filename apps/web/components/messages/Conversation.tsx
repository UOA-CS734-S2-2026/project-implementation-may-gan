"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { messagingApi, type MessagingMessage } from "@/lib/api/messaging";
import { mergeMessages } from "@/lib/messaging/reconcile";

export function Conversation({ conversationId }: { conversationId: string }) {
  const [messages, setMessages] = useState<MessagingMessage[]>([]);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const refresh = useCallback(async () => {
    const result = await messagingApi.messages(conversationId);
    if (result.ok) { setMessages((current) => mergeMessages(current, result.value.items)); setNotice(null); }
    else setNotice(result.message);
  }, [conversationId]);
  useEffect(() => { void Promise.resolve().then(refresh); }, [refresh]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const value = text;
    if (value.trim().length === 0 || sending) return;
    setSending(true); setText(""); setNotice(null);
    const clientMessageId = crypto.randomUUID();
    const pending: MessagingMessage = { id: `pending:${clientMessageId}`, conversationId, sequence: "999999999999999999", senderId: "me", clientMessageId, text: value, version: 0, createdAt: new Date().toISOString(), editedAt: null, unsentAt: null, replyToMessageId: null, reactions: [] };
    setMessages((current) => [...current, pending]);
    const result = await messagingApi.send(conversationId, clientMessageId, value);
    if (result.ok) setMessages((current) => mergeMessages(current.filter((item) => item.id !== pending.id), [result.value]));
    else { setMessages((current) => current.filter((item) => item.id !== pending.id)); setText(value); setNotice(result.message); }
    setSending(false);
  }

  return <section className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10 md:px-12"><header className="border-b border-foreground/10 pb-5"><Link className="font-sans text-sm text-foreground-secondary hover:text-foreground-accent" href="/messages">← all messages</Link><h1 className="mt-3 font-serif text-3xl">conversation</h1></header><div className="flex-1 space-y-4 py-8" aria-live="polite">{messages.map((message) => <article key={message.id} className={`max-w-[80%] rounded-2xl px-4 py-3 font-sans text-sm ${message.senderId === "me" ? "ml-auto bg-foreground-accent text-white" : "bg-background-secondary text-foreground"}`}><p>{message.text ?? "This message was unsent."}</p>{message.editedAt && <small className="mt-1 block opacity-65">edited</small>}</article>)}</div>{notice && <p role="status" className="mb-3 font-sans text-sm text-foreground-secondary">{notice}</p>}<form onSubmit={send} className="sticky bottom-4 flex gap-2 rounded-2xl border border-foreground/15 bg-background p-2 shadow-card"><label className="sr-only" htmlFor="message-text">Message</label><textarea id="message-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={16000} rows={1} className="min-h-11 flex-1 resize-none bg-transparent px-3 py-2 font-sans text-sm outline-none" placeholder="Write a message"/><button type="submit" disabled={sending || text.trim().length === 0} className="rounded-xl bg-foreground-accent px-4 font-serif text-sm text-white disabled:opacity-50">send</button></form></section>;
}

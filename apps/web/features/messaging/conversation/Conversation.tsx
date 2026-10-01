"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { messagingApi, type MessagingMessage, type Reaction } from "@/features/messaging/shared/messaging.api";
import { flattenMessagePages, mergeMessageIntoPages, updateMessagePages } from "@/features/messaging/shared/message-cache";
import { unwrapMessagingResult } from "@/features/messaging/shared/query-result";
import { useEditMessageMutation } from "@/features/messaging/edit-message/use-edit-message-mutation";
import { useMarkReadMutation } from "@/features/messaging/mark-read/use-mark-read-mutation";
import { useMessageHistoryQuery } from "@/features/messaging/message-history/use-message-history-query";
import { useRemoveReactionMutation } from "@/features/messaging/remove-reaction/use-remove-reaction-mutation";
import { useResolveRequestMutation } from "@/features/messaging/resolve-request/use-resolve-request-mutation";
import { useSendMessageMutation, type SendMessageIntent } from "@/features/messaging/send-message/use-send-message-mutation";
import { useSetReactionMutation } from "@/features/messaging/set-reaction/use-set-reaction-mutation";
import { useUnsendMessageMutation } from "@/features/messaging/unsend-message/use-unsend-message-mutation";
import { createClientMessageId } from "../shared/client-id";
import { useSession } from "@/lib/session/hooks";
import { useMessagingLive } from "@/features/messaging/realtime/MessagingProvider";
import { MessageBubble } from "../shared/MessageBubble";
import { useConversationQuery } from "./use-conversation-query";

const validText = (value: string) => value.trim().length > 0 && Array.from(value).length <= 4_000;

export function Conversation({ conversationId }: { conversationId: string }) {
  const { user } = useSession();
  return <ConversationBody key={`${user?.id ?? "anonymous"}:${conversationId}`} conversationId={conversationId} />;
}

function errorMessage(...errors: unknown[]) {
  const error = errors.find(Boolean);
  return error instanceof Error ? error.message : null;
}

function ConversationBody({ conversationId }: { conversationId: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { revision, changesFor } = useMessagingLive();
  const handledChanges = useRef(new Set<string>());
  const conversationQuery = useConversationQuery(conversationId);
  const history = useMessageHistoryQuery(conversationId);
  const send = useSendMessageMutation(conversationId);
  const edit = useEditMessageMutation(conversationId);
  const unsend = useUnsendMessageMutation(conversationId);
  const setReaction = useSetReactionMutation(conversationId);
  const removeReaction = useRemoveReactionMutation(conversationId);
  const resolveRequest = useResolveRequestMutation(conversationId);
  const markRead = useMarkReadMutation(conversationId);
  const { mutateAsync: markReadAsync } = markRead;
  const conversation = conversationQuery.data;
  const messages = flattenMessagePages(history.data);
  const incoming = [...messages].reverse().find((message) => message.senderId !== user?.id && !message.delivery);
  const incomingId = incoming?.id;
  const incomingSequence = incoming?.sequence;
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const [editing, setEditing] = useState<MessagingMessage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [readRetry, setReadRetry] = useState(0);
  const readThrough = useRef("0");
  const pendingReadThrough = useRef("0");
  const readInFlight = useRef(false);
  const readTarget = useRef<HTMLDivElement | null>(null);
  const readTargetVisible = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const composing = useRef(false);

  useEffect(() => {
    if (!conversation || BigInt(conversation.lastReadSequence) <= BigInt(readThrough.current)) return;
    readThrough.current = conversation.lastReadSequence;
    if (BigInt(pendingReadThrough.current) < BigInt(readThrough.current)) pendingReadThrough.current = readThrough.current;
  }, [conversation]);

  useEffect(() => {
    const changes = changesFor(conversationId).filter((change) => !handledChanges.current.has(change.changeSequence));
    if (!changes.length || !user?.id) return;
    changes.forEach((change) => handledChanges.current.add(change.changeSequence));
    void Promise.all(changes.filter((change) => change.messageId).map(async (change) => unwrapMessagingResult(await messagingApi.message(conversationId, change.messageId as string)))).then((liveMessages) => {
      liveMessages.forEach((message) => updateMessagePages(queryClient, user.id, conversationId, (data) => mergeMessageIntoPages(data, [message]) ?? data));
    });
  }, [changesFor, conversationId, queryClient, revision, user?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const target = readTarget.current;
    if (!target || !conversation || typeof IntersectionObserver === "undefined") {
      readTargetVisible.current = false;
      return;
    }
    const markVisibleIncomingRead = () => {
      if (document.visibilityState !== "visible" || !incomingSequence || BigInt(incomingSequence) <= BigInt(readThrough.current)) return;
      if (BigInt(incomingSequence) > BigInt(pendingReadThrough.current)) pendingReadThrough.current = incomingSequence;
      if (readInFlight.current) return;
      const throughSequence = pendingReadThrough.current;
      if (BigInt(throughSequence) <= BigInt(readThrough.current)) return;
      readInFlight.current = true;
      void markReadAsync(throughSequence).then((receipt) => {
        if (BigInt(receipt.lastReadSequence) > BigInt(readThrough.current)) readThrough.current = receipt.lastReadSequence;
        readInFlight.current = false;
        // Only drain a sequence that arrived while this request was in flight. A stale receipt must not spin retries without a later visibility signal.
        if (document.visibilityState === "visible" && BigInt(pendingReadThrough.current) > BigInt(throughSequence)) setReadRetry((attempt) => attempt + 1);
      }, () => {
        readInFlight.current = false;
      });
    };
    const observer = new IntersectionObserver((entries) => {
      readTargetVisible.current = entries.some((entry) => entry.isIntersecting);
      if (readTargetVisible.current) markVisibleIncomingRead();
    }, { threshold: 0.6 });
    const foreground = () => {
      if (document.visibilityState === "visible" && readTargetVisible.current) markVisibleIncomingRead();
    };
    observer.observe(target);
    document.addEventListener("visibilitychange", foreground);
    if (readRetry && readTargetVisible.current) markVisibleIncomingRead();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [conversation, incomingId, incomingSequence, markReadAsync, readRetry]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validText(text)) return;
    if (editing) {
      try {
        await edit.mutateAsync({ messageId: editing.id, text, expectedVersion: editing.version });
        setEditing(null);
        setText("");
      } catch (error) {
        setNotice(errorMessage(error));
        if (error instanceof Error && "failure" in error && error.failure === "conflict") {
          try {
            await unwrapMessagingResult(await messagingApi.message(conversationId, editing.id));
            await history.refetch();
          } catch {}
        }
      }
      return;
    }
    if (!conversation?.capabilities.canSend) return;
    const intent: SendMessageIntent = { clientMessageId: createClientMessageId(), text, ...(replyTo ? { replyToMessageId: replyTo.id } : {}) };
    setText("");
    setNotice(null);
    try {
      await send.mutateAsync(intent);
      setReplyTo(null);
    } catch {}
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || composing.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (validText(text) && (editing || conversation?.capabilities.canSend)) formRef.current?.requestSubmit();
  }

  async function retry(message: ReturnType<typeof flattenMessagePages>[number]) {
    if (!message.retryIntent) return;
    try {
      await send.mutateAsync(message.retryIntent);
    } catch {}
  }

  async function react(message: MessagingMessage, reaction: Reaction) {
    const current = message.reactions.find((item) => item.reaction === reaction);
    try {
      await (current?.reactedByActor ? removeReaction.mutateAsync({ messageId: message.id }) : setReaction.mutateAsync({ messageId: message.id, reaction }));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function heart(message: MessagingMessage) {
    if (message.reactions.some((item) => item.reaction === "love" && item.reactedByActor)) return;
    try {
      await setReaction.mutateAsync({ messageId: message.id, reaction: "love" });
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  const mutationError = errorMessage(send.error, edit.error, unsend.error, setReaction.error, removeReaction.error, resolveRequest.error, markRead.error);
  const canInteract = Boolean(conversation?.capabilities.canSend && conversation.requestState === "active");
  const canUnsend = Boolean(conversation && conversation.requestState !== "active" ? true : conversation?.capabilities.canSend);

  return <section className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10 md:px-12">
    <header className="border-b border-foreground/10 pb-5">
      <Link className="font-sans text-sm text-foreground-secondary hover:text-foreground-accent" href="/messages">← all messages</Link>
      <h1 className="mt-3 font-serif text-3xl">{conversation?.peer.name ?? "conversation"}</h1>
      {conversation?.requestState === "pending" && <p className="mt-2 font-sans text-sm text-foreground-secondary">Message request. Actions stay private until it is accepted.</p>}
      {conversation && !conversation.capabilities.canSend && <p className="mt-2 font-sans text-sm text-foreground-secondary">New actions are unavailable in this conversation.</p>}
    </header>
    {conversation?.capabilities.canResolveRequest && <div className="mt-4 flex gap-2"><button type="button" onClick={() => resolveRequest.mutate("accept")} className="rounded-xl bg-foreground-accent px-4 py-2 font-serif text-sm text-white">accept request</button><button type="button" onClick={() => resolveRequest.mutate("decline")} className="rounded-xl border border-foreground/20 px-4 py-2 font-serif text-sm">decline</button></div>}
    <div className="flex-1 space-y-4 py-8" aria-live="polite">
      {history.isLoading && !history.data && <div aria-label="Loading messages" className="space-y-4"><div className="message-skeleton message-skeleton-bubble ml-auto" /><div className="message-skeleton message-skeleton-bubble" /><div className="message-skeleton message-skeleton-bubble ml-auto" /></div>}
      {history.hasNextPage && <button type="button" onClick={() => void history.fetchNextPage()} className="mx-auto block rounded-full border border-foreground/15 px-4 py-2 font-sans text-sm hover:border-foreground-accent">load older messages</button>}
      {messages.map((message) => <div key={message.id}>{message.delivery && <div className="mb-1 flex justify-end gap-2 font-sans text-xs text-foreground-secondary"><span>{message.delivery === "failed" ? "not sent" : "sending"}</span>{message.delivery === "failed" && <button type="button" onClick={() => void retry(message)} className="underline">retry</button>}</div>}<MessageBubble message={message} own={message.senderId === user?.id} canInteract={canInteract} canUnsend={canUnsend} canEdit={now > 0 && now < new Date(message.createdAt).getTime() + 15 * 60 * 1_000} receiptSequence={conversation?.receiptSequence ?? "0"} onReply={(selected) => { setReplyTo(selected); setEditing(null); }} onEdit={(selected) => { setEditing(selected); setReplyTo(null); setText(selected.text ?? ""); }} onUnsend={(selected) => unsend.mutate({ messageId: selected.id }, { onError: (error) => setNotice(errorMessage(error)) })} onReaction={(selected, reaction) => void react(selected, reaction)} onHeart={(selected) => void heart(selected)} /></div>)}
      {incoming && <div ref={readTarget} aria-label="Messages visible" className="h-px" />}
    </div>
    {(notice ?? mutationError ?? (history.error instanceof Error ? history.error.message : null)) && <p role="status" className="mb-3 font-sans text-sm text-foreground-secondary">{notice ?? mutationError ?? (history.error as Error).message}</p>}
    {replyTo && <div className="flex items-center justify-between border-t border-foreground/10 px-2 py-2 font-sans text-xs text-foreground-secondary">Replying to: {replyTo.text ?? "Message removed"}<button type="button" onClick={() => setReplyTo(null)} className="underline">cancel</button></div>}
    {editing && <div className="flex items-center justify-between border-t border-foreground/10 px-2 py-2 font-sans text-xs text-foreground-secondary">Editing message, changes are allowed for 15 minutes.<button type="button" onClick={() => { setEditing(null); setText(""); }} className="underline">cancel</button></div>}
    <form ref={formRef} onSubmit={submit} className="sticky bottom-4 flex gap-2 rounded-2xl border border-foreground/15 bg-background p-2 shadow-card">
      <label className="sr-only" htmlFor="message-text">Message</label>
      <textarea id="message-text" value={text} onChange={(event) => setText(event.target.value)} onKeyDown={sendOnEnter} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} maxLength={8000} rows={1} disabled={!editing && !conversation?.capabilities.canSend} className="min-h-11 flex-1 resize-none bg-transparent px-3 py-2 font-sans text-sm outline-none disabled:opacity-50" placeholder={editing ? "Edit message" : conversation?.capabilities.canSend ? "Write a message" : "Messaging is unavailable"} />
      <button type="submit" disabled={!validText(text) || (!editing && !conversation?.capabilities.canSend)} className="rounded-xl bg-foreground-accent px-4 font-serif text-sm text-white disabled:opacity-50">{editing ? "save" : "send"}</button>
    </form>
  </section>;
}

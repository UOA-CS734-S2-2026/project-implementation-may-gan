"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session/hooks";
import { loadSocialProfile } from "@/lib/api/friends";
import { messagingApi } from "@/features/messaging/shared/messaging.api";
import { useCreateConversationMutation } from "@/features/messaging/create-conversation/use-create-conversation-mutation";
import { createClientMessageId } from "@/features/messaging/shared/client-id";

const validText = (value: string) => value.trim().length > 0 && Array.from(value).length <= 4_000;

/** A route-backed draft. It creates no empty conversation and becomes canonical only on first send. */
export default function NewMessagePage({ params }: { params: Promise<{ username: string }> }) {
  const username = use(params).username;
  const { user } = useSession();
  return <ActorScopedNewMessage actorId={user?.id ?? "anonymous"} username={username} />;
}

/** Keys private draft state to the authenticated actor before rendering it. */
export function ActorScopedNewMessage({ actorId, username }: { actorId: string; username: string }) {
  return <NewMessage key={`${actorId}:${username}`} username={username} />;
}

export function NewMessage({ username }: { username: string }) {
  const router = useRouter();
  const { user } = useSession();
  const profile = useQuery({ queryKey: ["social-profile", user?.id ?? "anonymous", username], retry: false, queryFn: async () => { const result = await loadSocialProfile(username); if (!result.ok) throw new Error(result.failure); return result.value; } });
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<{ clientMessageId: string; text: string } | null>(null);
  const active = useRef(true);
  const formRef = useRef<HTMLFormElement | null>(null);
  const composing = useRef(false);
  const actorId = user?.id ?? "anonymous";
  useEffect(() => {
    // Strict Mode rehearses setup and cleanup in development. Reset the liveness
    // flag during every setup so the rehearsal cannot suppress a real redirect.
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const direct = useCreateConversationMutation();
  const existing = useQuery({ queryKey: ["direct-pair", user?.id ?? "anonymous", profile.data?.id ?? ""], enabled: Boolean(profile.data?.id), retry: false, queryFn: async () => { const result = await messagingApi.findDirect(profile.data!.id); if (result.ok) return result.value; if (result.failure === "notFound") return null; throw new Error(result.message); } });
  useEffect(() => { if (existing.data?.conversationId) router.replace(`/messages/${existing.data.conversationId}`); }, [existing.data?.conversationId, router]);

  if (profile.isPending) return <main className="mx-auto max-w-2xl px-6 py-12 font-serif text-foreground-secondary">Preparing your note…</main>;
  if (profile.isError || !profile.data) return <main className="mx-auto max-w-2xl px-6 py-12"><h1 className="font-serif text-3xl">This profile is unavailable</h1></main>;
  if (existing.isPending) return <main className="mx-auto max-w-2xl px-6 py-12 font-serif text-foreground-secondary">Preparing your note…</main>;
  if (existing.isError) return <main className="mx-auto max-w-2xl px-6 py-12"><h1 className="font-serif text-3xl">Conversation lookup is unavailable</h1><p className="mt-3 font-sans text-sm text-foreground-secondary">Please try again before sending a new message.</p><button type="button" onClick={() => void existing.refetch()} className="mt-4 rounded-xl border border-foreground/20 px-4 py-2 font-sans text-sm">Retry lookup</button></main>;
  if (existing.data?.conversationId) return <main className="mx-auto max-w-2xl px-6 py-12 font-serif text-foreground-secondary">Opening conversation…</main>;

  const recipient = profile.data;
  async function send() {
    if (!validText(text) || direct.isPending) return;
    const stable = intent ?? { clientMessageId: createClientMessageId(), text };
    setIntent(stable);
    try {
      const created = await direct.mutateAsync({ recipientId: recipient.id, ...stable });
      if (active.current && actorId === (user?.id ?? "anonymous")) router.replace(`/messages/${created.conversation.id}`);
    } catch { /* Preserve the exact request intent for an idempotent retry. */ }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }
  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || composing.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (validText(text)) formRef.current?.requestSubmit();
  }

  return <section className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-10 md:px-12">
    <header className="border-b border-foreground/10 pb-5">
      <Link href={`/u/${encodeURIComponent(recipient.username)}`} className="font-sans text-sm text-foreground-secondary hover:text-foreground-accent">← @{recipient.username}</Link>
      <h1 className="mt-3 font-serif text-3xl">{recipient.displayName}</h1>
    </header>
    <div className="flex-1 py-8" aria-live="polite" />
    {direct.error instanceof Error && <p role="status" className="mb-3 font-sans text-sm text-foreground-secondary">{direct.error.message}</p>}
    <form ref={formRef} onSubmit={submit} className="sticky bottom-4 flex gap-2 rounded-2xl border border-foreground/15 bg-background p-2 shadow-card">
      <label className="sr-only" htmlFor="draft-message">Message</label>
      <textarea id="draft-message" value={text} onChange={(event) => { setText(event.target.value); if (intent) setIntent(null); }} onKeyDown={sendOnEnter} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} maxLength={8000} rows={1} placeholder="Write a message" className="min-h-11 flex-1 resize-none bg-transparent px-3 py-2 font-sans text-sm outline-none" />
      <button type="submit" disabled={!validText(text) || direct.isPending} className="rounded-xl bg-foreground-accent px-4 font-serif text-sm text-white disabled:opacity-50">{direct.isPending ? "sending…" : intent ? "retry send" : "send"}</button>
    </form>
  </section>;
}

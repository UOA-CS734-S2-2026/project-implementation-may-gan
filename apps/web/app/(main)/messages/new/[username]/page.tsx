"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
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
  return <NewMessage username={use(params).username} />;
}

function NewMessage({ username }: { username: string }) {
  const router = useRouter();
  const { user } = useSession();
  const profile = useQuery({ queryKey: ["social-profile", user?.id ?? "anonymous", username], retry: false, queryFn: async () => { const result = await loadSocialProfile(username); if (!result.ok) throw new Error(result.failure); return result.value; } });
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<{ clientMessageId: string; text: string } | null>(null);
  const direct = useCreateConversationMutation();
  const existing = useQuery({ queryKey: ["direct-pair", user?.id ?? "anonymous", profile.data?.id ?? ""], enabled: Boolean(profile.data?.id), retry: false, queryFn: async () => { const result = await messagingApi.findDirect(profile.data!.id); if (result.ok) return result.value; if (result.failure === "notFound") return null; throw new Error(result.message); } });
  useEffect(() => { if (existing.data?.conversationId) router.replace(`/messages/${existing.data.conversationId}`); }, [existing.data?.conversationId, router]);
  if (profile.isPending) return <main className="mx-auto max-w-2xl px-6 py-12 font-serif text-foreground-secondary">Preparing your note…</main>;
  if (profile.isError || !profile.data) return <main className="mx-auto max-w-2xl px-6 py-12"><h1 className="font-serif text-3xl">This profile is unavailable</h1></main>;
  if (existing.isPending) return <main className="mx-auto max-w-2xl px-6 py-12 font-serif text-foreground-secondary">Preparing your note…</main>;
  if (existing.isError) return <main className="mx-auto max-w-2xl px-6 py-12"><h1 className="font-serif text-3xl">Conversation lookup is unavailable</h1><p className="mt-3 font-sans text-sm text-foreground-secondary">Please try again before sending a new message.</p></main>;
  if (existing.data?.conversationId) return <main className="mx-auto max-w-2xl px-6 py-12 font-serif text-foreground-secondary">Opening conversation…</main>;
  const recipient = profile.data;
  async function send() {
    if (!validText(text) || direct.isPending) return;
    const stable = intent ?? { clientMessageId: createClientMessageId(), text };
    setIntent(stable);
    try { const created = await direct.mutateAsync({ recipientId: recipient.id, ...stable }); router.replace(`/messages/${created.conversation.id}`); } catch { /* Preserve the exact request intent for an idempotent retry. */ }
  }
  return <main className="mx-auto max-w-2xl px-6 py-12"><Link href={`/${recipient.username}`} className="font-sans text-sm text-foreground-secondary hover:text-foreground-accent">← @{recipient.username}</Link><section className="mt-5 rounded-2xl bg-background p-6 shadow-card"><p className="text-xs text-foreground-tertiary">private note to</p><h1 className="mt-1 font-serif text-3xl tracking-tight">{recipient.displayName}</h1><p className="text-sm text-foreground-tertiary">@{recipient.username}</p><p className="mt-5 font-sans text-sm text-foreground-secondary">Your first message creates a private request. Nothing is created until you send it.</p><label className="sr-only" htmlFor="draft-message">Message</label><textarea id="draft-message" value={text} onChange={(event) => { setText(event.target.value); if (intent) setIntent(null); }} maxLength={8000} rows={4} placeholder="Write a message" className="mt-5 w-full resize-none rounded-xl border border-foreground/15 bg-background-secondary/40 px-4 py-3 font-sans text-sm outline-none focus:ring-2 focus:ring-accent"/><div className="mt-3 flex justify-end"><button type="button" onClick={() => void send()} disabled={!validText(text) || direct.isPending} className="rounded-xl bg-foreground-accent px-5 py-2 font-serif text-sm text-white disabled:opacity-50">{direct.isPending ? "sending…" : intent ? "retry send" : "send"}</button></div>{direct.error instanceof Error && <p role="status" className="mt-3 font-sans text-sm text-foreground-secondary">{direct.error.message}</p>}</section></main>;
}

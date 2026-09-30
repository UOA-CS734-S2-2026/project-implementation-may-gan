"use client";

import Link from "next/link";
import { use } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session/hooks";
import { acceptFriendRequest, cancelFriendRequest, getRelationship, loadSocialProfile, removeFriend, sendFriendRequest, type FriendsResult } from "@/lib/api/friends";

function requireFriendAction<T>(result: FriendsResult<T>): T {
  if (!result.ok) throw new Error("Friendship action failed. Please try again.");
  return result.value;
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  return <Profile username={use(params).username} />;
}

export function Profile({ username: handle }: { username: string }) {
  const { user } = useSession();
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ["social-profile", user?.id ?? "anonymous", handle], enabled: Boolean(handle), retry: false, queryFn: async () => { const result = await loadSocialProfile(handle); if (!result.ok) throw new Error(result.failure); return result.value; } });
  const action = useMutation({ mutationFn: async () => {
    const person = profile.data!;
    if (person.relationship === "none") return requireFriendAction(await sendFriendRequest(person.id));
    if (person.relationship === "friends") return requireFriendAction(await removeFriend(person.id));
    const relationship = requireFriendAction(await getRelationship(person.id));
    if (person.relationship === "incoming_pending" && relationship.incomingRequest) return requireFriendAction(await acceptFriendRequest(relationship.incomingRequest.id));
    if (person.relationship === "outgoing_pending" && relationship.outgoingRequest) return requireFriendAction(await cancelFriendRequest(relationship.outgoingRequest.id));
    throw new Error("That request is no longer available.");
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ["social-profile", user?.id ?? "anonymous", handle] }); void client.invalidateQueries({ queryKey: ["social-search", user?.id ?? "anonymous"] }); void client.invalidateQueries({ queryKey: ["friends", user?.id ?? "anonymous"] }); } });
  if (profile.isPending) return <main className="mx-auto max-w-4xl px-8 py-12 font-serif text-foreground-secondary">Loading profile…</main>;
  if (profile.isError || !profile.data) return <main className="mx-auto max-w-4xl px-8 py-12"><h1 className="font-serif text-4xl">This profile is unavailable</h1><p className="mt-3 font-sans text-sm text-foreground-secondary">It may not exist or may not be available to you.</p></main>;
  const person = profile.data;
  const isMe = person.id === user?.id;
  const label = person.relationship === "none" ? "add friend" : person.relationship === "incoming_pending" ? "accept request" : person.relationship === "outgoing_pending" ? "cancel request" : "remove friend";
  return <main className="mx-auto max-w-[1000px] px-6 py-12 md:px-8"><section className="mx-auto flex max-w-4xl flex-col gap-8 rounded-2xl bg-background p-8 shadow-card sm:flex-row sm:gap-12"><div className="flex shrink-0 flex-col items-center gap-4 sm:w-44"><span aria-hidden className="grid h-28 w-28 place-items-center rounded-full bg-background-accent font-serif text-3xl font-semibold text-foreground-accent">{person.displayName.slice(0, 1).toUpperCase()}</span><div className="text-center"><p className="text-xs text-foreground-tertiary">@{person.username}</p><h1 className="mt-0.5 font-serif text-2xl font-semibold tracking-tighter">{person.displayName}</h1></div>{!isMe && <div className="flex w-full flex-col gap-2"><button type="button" onClick={() => action.mutate()} disabled={action.isPending} className="rounded-xl bg-foreground-accent px-4 py-2 font-serif text-sm text-white disabled:opacity-50">{action.isPending ? "working…" : label}</button><Link href={`/messages/new/${encodeURIComponent(person.username)}`} className="rounded-xl border border-foreground/20 px-4 py-2 text-center font-serif text-sm hover:bg-background-secondary">message</Link></div>}</div><div className="hidden w-px bg-foreground/10 sm:block"/><div className="flex flex-1 flex-col justify-center"><p className="font-sans text-sm text-foreground-tertiary">This profile only shares the name they chose and their username.</p>{action.error instanceof Error && <p role="status" className="mt-3 font-sans text-sm text-foreground-secondary">{action.error.message}</p>}{isMe && <Link href={`/u/${encodeURIComponent(person.username)}/friends`} className="mt-6 font-serif text-sm underline">view friends</Link>}</div></section></main>;
}

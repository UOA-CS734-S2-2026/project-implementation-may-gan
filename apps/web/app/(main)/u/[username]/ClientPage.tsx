"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session/hooks";
import { acceptFriendRequest, cancelFriendRequest, getRelationship, loadSocialProfile, removeFriend, sendFriendRequest, type FriendsResult } from "@/lib/api/friends";
import { ProfilePosts } from "@/features/posts/list-profile-posts/ProfilePosts";
import { useProfileDetailsQuery } from "@/features/profiles/get-profile-details/use-profile-details-query";
import { ProfileStreak } from "@/features/profiles/get-profile-details/ProfileStreak";
import { ProfileAvatar } from "@/features/profiles/update-profile/AvatarForm";

function requireFriendAction<T>(result: FriendsResult<T>): T {
  if (!result.ok) throw new Error("Friendship action failed. Please try again.");
  return result.value;
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  return <Profile username={decodeURIComponent(use(params).username)} />;
}

export function Profile({ username: requested }: { username: string }) {
  const { user } = useSession();
  const router = useRouter();
  const client = useQueryClient();
  const details = useProfileDetailsQuery(requested);
  // The details read resolves a handle the owner has since changed to their current one.
  const handle = details.data?.username;
  const moved = Boolean(handle && handle.toLowerCase() !== requested.toLowerCase());
  useEffect(() => {
    if (moved && handle) router.replace(`/u/${encodeURIComponent(handle)}`);
  }, [moved, handle, router]);

  const profile = useQuery({ queryKey: ["social-profile", user?.id ?? "anonymous", handle], enabled: Boolean(handle) && !moved, retry: false, queryFn: async () => { const result = await loadSocialProfile(handle!); if (!result.ok) throw new Error(result.failure); return result.value; } });
  const action = useMutation({ mutationFn: async () => {
    const person = profile.data!;
    if (person.relationship === "none") return requireFriendAction(await sendFriendRequest(person.id));
    if (person.relationship === "friends") return requireFriendAction(await removeFriend(person.id));
    const relationship = requireFriendAction(await getRelationship(person.id));
    if (person.relationship === "incoming_pending" && relationship.incomingRequest) return requireFriendAction(await acceptFriendRequest(relationship.incomingRequest.id));
    if (person.relationship === "outgoing_pending" && relationship.outgoingRequest) return requireFriendAction(await cancelFriendRequest(relationship.outgoingRequest.id));
    throw new Error("That request is no longer available.");
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ["social-profile", user?.id ?? "anonymous", handle] }); void client.invalidateQueries({ queryKey: ["social-search", user?.id ?? "anonymous"] }); void client.invalidateQueries({ queryKey: ["friends", user?.id ?? "anonymous"] }); void client.invalidateQueries({ queryKey: ["profiles", user?.id ?? "anonymous"] }); } });
  if (details.isError || profile.isError) return <main className="mx-auto max-w-4xl px-8 py-12"><h1 className="font-serif text-4xl">This profile is unavailable</h1><p className="mt-3 font-sans text-sm text-foreground-secondary">It may not exist or may not be available to you.</p></main>;
  if (details.isPending || moved || profile.isPending || !profile.data || !details.data) return <main className="mx-auto max-w-4xl px-8 py-12 font-serif text-foreground-secondary">Loading profile…</main>;
  const person = profile.data;
  const info = details.data;
  const isMe = person.id === user?.id;
  const label = person.relationship === "none" ? "add friend" : person.relationship === "incoming_pending" ? "accept request" : person.relationship === "outgoing_pending" ? "cancel request" : "remove friend";
  return <main className="mx-auto max-w-[1000px] px-6 py-12 md:px-8"><section className="mx-auto flex max-w-4xl flex-col gap-8 rounded-2xl bg-background p-8 shadow-card sm:flex-row sm:gap-12"><div className="flex shrink-0 flex-col items-center gap-4 sm:w-44"><ProfileAvatar profile={info} size={112} /><div className="text-center"><p className="text-xs text-foreground-tertiary">@{info.username}</p><h1 className="mt-0.5 font-serif text-2xl font-semibold tracking-tighter">{info.displayName}</h1></div>{!isMe && <div className="flex w-full flex-col gap-2"><button type="button" onClick={() => action.mutate()} disabled={action.isPending} className="rounded-xl bg-foreground-accent px-4 py-2 font-serif text-sm text-white disabled:opacity-50">{action.isPending ? "working…" : label}</button><Link href={`/messages/new/${encodeURIComponent(person.username)}`} className="rounded-xl border border-foreground/20 px-4 py-2 text-center font-serif text-sm hover:bg-background-secondary">message</Link></div>}</div><div className="hidden w-px bg-foreground/10 sm:block"/><div className="flex flex-1 flex-col justify-center gap-3">{info.detailsVisible ? (info.bio ? <p className="whitespace-pre-line font-serif text-lg tracking-tight">{info.bio}</p> : isMe && <p className="font-sans text-sm text-foreground-tertiary">You haven&apos;t written a bio yet.</p>) : <p className="font-sans text-sm text-foreground-tertiary">{info.displayName}&apos;s profile is private.</p>}<ProfileStreak streak={info.streak} isMe={isMe} />{!isMe && person.relationship !== "friends" && <p className="font-sans text-sm text-foreground-tertiary">Add {info.displayName} as a friend to see their daylies.</p>}{action.error instanceof Error && <p role="status" className="font-sans text-sm text-foreground-secondary">{action.error.message}</p>}{isMe && <div className="mt-3 flex gap-4 font-serif text-sm"><Link href="/settings" className="underline">edit profile</Link><Link href={`/u/${encodeURIComponent(info.username)}/friends`} className="underline">view friends</Link></div>}</div></section><section aria-label={isMe ? "your daylies" : `${info.displayName}'s daylies`} className="mt-12">{(isMe || person.relationship === "friends") && <ProfilePosts username={info.username} displayName={info.displayName} isMe={isMe} />}</section></main>;
}

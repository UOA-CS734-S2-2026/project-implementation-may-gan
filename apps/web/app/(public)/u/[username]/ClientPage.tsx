"use client";

import { use, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { acceptFriendRequest, cancelFriendRequest, getRelationship, loadSocialProfile, removeFriend, sendFriendRequest, type FriendsResult } from "@/lib/api/friends";
import { ProfilePosts } from "@/features/posts/list-profile-posts/ProfilePosts";
import { postKeys } from "@/features/posts/shared/posts.keys";
import { useProfileDetailsQuery } from "@/features/profiles/get-profile-details/use-profile-details-query";
import { ProfileStats } from "@/features/profiles/get-profile-details/ProfileStats";
import { ProfileAbout } from "@/features/profiles/get-profile-details/ProfileAbout";
import { Button } from "@/components/ui/core/Button";
import { ProfileAvatar } from "@/features/profiles/update-profile/AvatarForm";
import { useSession } from "@/lib/session/hooks";
import { isPublicAction, rememberPublicIntent, resumePublicIntent, signInForPublicAction, withPublicAction, type PublicAction } from "@/lib/routing/public-return-intent";
import { profileKeys } from "@/features/profiles/shared/profiles.keys";
import { ProfileActions } from "./_components/ProfileActions";

function requireFriendAction<T>(result: FriendsResult<T>): T {
  if (!result.ok) throw new Error("Friendship action failed. Please try again.");
  return result.value;
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  return <Profile username={decodeURIComponent(use(params).username)} />;
}

export function Profile({ username: requested }: { username: string }) {
  const { user, isPending: sessionPending } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const client = useQueryClient();
  const details = useProfileDetailsQuery(requested);
  const info = details.data;
  const handle = info?.username;
  const moved = Boolean(handle && handle.toLowerCase() !== requested.toLowerCase());
  const rawIntent = searchParams.get("intent");
  const candidateIntent = isPublicAction(rawIntent) && (rawIntent === "friend-request" || rawIntent === "message-request") ? rawIntent : null;
  const intent = !sessionPending && candidateIntent && user && resumePublicIntent(`${pathname}?intent=${candidateIntent}`, user.id)
    ? candidateIntent
    : null;
  useEffect(() => {
    if (rawIntent && !sessionPending && !intent) router.replace(pathname);
  }, [intent, pathname, rawIntent, router, sessionPending]);
  useEffect(() => {
    if (moved && handle) router.replace(`/u/${encodeURIComponent(handle)}${intent ? `?intent=${intent}` : ""}`);
  }, [handle, intent, moved, router]);
  useEffect(() => {
    if (user && intent && details.isSuccess) void details.refetch();
    // Refetch once after the initial authenticated response settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.isSuccess, intent, user?.id]);

  const social = useQuery({
    queryKey: ["social-profile", user?.id, handle],
    enabled: Boolean(user && handle && !moved),
    retry: false,
    queryFn: async () => {
      const result = await loadSocialProfile(handle!);
      if (!result.ok) throw new Error(result.failure);
      return result.value;
    },
  });
  useEffect(() => {
    const actor = user?.id ?? "anonymous";
    if (info?.kind === "restricted") {
      client.removeQueries({ queryKey: postKeys.profile(actor, info.username) });
    }
    if (details.isError || social.isError) {
      void client.cancelQueries({ queryKey: profileKeys.details(actor, requested) });
      client.removeQueries({ queryKey: profileKeys.details(actor, requested) });
      client.removeQueries({ queryKey: postKeys.profile(actor, requested) });
      if (handle) client.removeQueries({ queryKey: postKeys.profile(actor, handle) });
    }
  }, [client, details.isError, handle, info, requested, social.isError, user?.id]);

  const friendAction = useMutation({
    mutationFn: async () => {
      const person = social.data!;
      if (person.relationship === "none") return requireFriendAction(await sendFriendRequest(person.id));
      if (person.relationship === "friends") return requireFriendAction(await removeFriend(person.id));
      const relationship = requireFriendAction(await getRelationship(person.id));
      if (person.relationship === "incoming_pending" && relationship.incomingRequest) return requireFriendAction(await acceptFriendRequest(relationship.incomingRequest.id));
      if (person.relationship === "outgoing_pending" && relationship.outgoingRequest) return requireFriendAction(await cancelFriendRequest(relationship.outgoingRequest.id));
      throw new Error("That request is no longer available.");
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["social-profile", user?.id, handle] });
      void client.invalidateQueries({ queryKey: ["social-search", user?.id] });
      void client.invalidateQueries({ queryKey: ["friends", user?.id] });
      void client.invalidateQueries({ queryKey: ["profiles", user?.id] });
      void details.refetch();
    },
  });

  if (details.isError || social.isError) return <Unavailable />;
  if (details.isPending || moved || !info || (user && social.isPending)) {
    return <main className="mx-auto max-w-4xl px-8 py-12 font-serif text-foreground-secondary"><p role="status">Loading profile...</p></main>;
  }

  if (info.kind === "restricted") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <section className="rounded-2xl bg-background p-8 text-center shadow-card">
          <div className="mx-auto grid size-24 place-items-center rounded-full bg-background-secondary text-3xl text-foreground-tertiary" aria-hidden>🔒</div>
          <h1 className="mt-5 break-all font-serif text-2xl font-semibold tracking-tight sm:text-3xl">@{info.username}</h1>
          <p className="mt-3 text-sm text-foreground-secondary">This profile is private.</p>
          <p className="mt-1 text-sm text-foreground-tertiary">Sign in and send a friend request to ask for access.</p>
          <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2">
            {user && social.data ? (
              <ProfileActions username={info.username} relationship={social.data.relationship} isPending={friendAction.isPending} onFriendAction={(done) => friendAction.mutate(undefined, { onSettled: done })} />
            ) : (
              <AnonymousProfileActions pathname={pathname} />
            )}
          </div>
          {user && intent && <IntentNotice action={intent} />}
          {friendAction.error instanceof Error && <p role="alert" className="mt-4 text-sm text-danger">{friendAction.error.message}</p>}
        </section>
      </main>
    );
  }

  const isAuthorized = info.kind === "authorized";
  const isMe = isAuthorized && info.id === user?.id;
  const displayName = info.displayName;
  return (
    <main className="mx-auto max-w-[1000px] px-6 py-12 md:px-8">
      {user && intent && <IntentNotice action={intent} />}
      <section className="mx-auto flex max-w-4xl flex-col gap-8 rounded-2xl bg-background p-8 shadow-card sm:flex-row sm:gap-12">
        <div className="flex shrink-0 flex-col items-center gap-4 sm:w-44">
          <ProfileAvatar profile={info} size={112} />
          <div className="text-center"><p className="text-xs text-foreground-tertiary">@{info.username}</p><h1 className="mt-0.5 font-serif text-2xl font-semibold tracking-tighter">{displayName}</h1></div>
          {isMe ? (
            <Button href="/settings" variant={{ weight: "secondary", color: "accent", size: "sm", width: "full" }}>Edit profile</Button>
          ) : user && social.data ? (
            <ProfileActions username={info.username} relationship={social.data.relationship} isPending={friendAction.isPending} onFriendAction={(done) => friendAction.mutate(undefined, { onSettled: done })} />
          ) : (
            <AnonymousProfileActions pathname={pathname} />
          )}
        </div>
        <div className="hidden w-px bg-foreground/10 sm:block" />
        <div className="flex flex-1 flex-col justify-center gap-3">
          {info.bio ? <p className="whitespace-pre-line font-serif text-lg tracking-tight">{info.bio}</p> : isMe && <p className="text-sm text-foreground-tertiary">You haven&apos;t written a bio yet.</p>}
          {isAuthorized && <ProfileAbout profile={info} />}
          {isAuthorized ? <ProfileStats profile={info} friendsHref={isMe ? `/u/${encodeURIComponent(info.username)}/friends` : undefined} /> : info.streak && (
            <div className="rounded-2xl bg-gray-100/80 px-6 py-4 text-center"><p className="text-xl font-bold text-orange-500">{info.streak.current}</p><p className="text-xs text-foreground-secondary">Day streak</p></div>
          )}
          {friendAction.error instanceof Error && <p role="alert" className="text-sm text-danger">{friendAction.error.message}</p>}
        </div>
      </section>
      <section aria-label={isMe ? "your daylies" : `${displayName}'s daylies`} className="mt-12">
        <ProfilePosts username={info.username} displayName={displayName} isMe={isMe} />
      </section>
    </main>
  );
}

function AnonymousProfileActions({ pathname }: { pathname: string }) {
  const remember = (action: PublicAction) => rememberPublicIntent(withPublicAction(pathname, action));
  return (
    <div className="flex w-full flex-col gap-2">
      <Button href={signInForPublicAction(pathname, "friend-request")} onClick={() => remember("friend-request")} variant={{ weight: "secondary", color: "accent", size: "sm", width: "full" }}>add friend</Button>
      <Button href={signInForPublicAction(pathname, "message-request")} onClick={() => remember("message-request")} variant={{ weight: "secondary", color: "background", size: "sm", width: "full" }}>message</Button>
    </div>
  );
}

function IntentNotice({ action }: { action: "friend-request" | "message-request" }) {
  return <p role="status" className="mx-auto mb-5 max-w-4xl rounded-xl bg-background-accent px-4 py-3 text-sm text-foreground-accent">You are signed in. Review this profile, then {action === "friend-request" ? "send the friend request" : "start the message"} when you are ready.</p>;
}

function Unavailable() {
  return <main className="mx-auto max-w-4xl px-8 py-12"><h1 className="font-serif text-4xl">This profile is unavailable</h1><p className="mt-3 text-sm text-foreground-secondary">It may not exist or may not be available to you.</p></main>;
}

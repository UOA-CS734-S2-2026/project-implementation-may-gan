"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PostForm from "./_components/PostForm";
import { useSession } from "@/lib/session/hooks";
import { PostDeadlineCountdown } from "@/components/ui/PostDeadlineCountdown";
import { Button } from "@/components/ui/core/Button";
import { getCurrentPostingDay, type PostingDay } from "@/lib/api/daily-posts";

type DayState =
  | { status: "loading" }
  | { status: "ready"; day: PostingDay }
  | { status: "error"; message: string };

export default function PostPage() {
  const router = useRouter();
  const { user, isPending } = useSession();
  const [state, setState] = useState<DayState>({ status: "loading" });

  const loadPostingDay = useCallback(async () => {
    const result = await getCurrentPostingDay();
    if (result.ok) {
      setState({ status: "ready", day: result.value });
    } else if (result.failure.kind === "unauthenticated") {
      router.replace("/sign-in");
    } else {
      setState({
        status: "error",
        message: result.failure.kind === "network"
          ? "You seem to be offline. Reconnect to load today's prompt."
          : "Today's prompt couldn't be loaded. Try again shortly.",
      });
    }
  }, [router]);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    // Load after the session resolves; state updates happen once the request settles.
    void Promise.resolve().then(loadPostingDay);
  }, [isPending, loadPostingDay, router, user]);

  if (isPending || !user || state.status === "loading") {
    return null;
  }

  return (
    <div className="space-y-6 px-10 py-20 md:p-44 flex flex-row">
      <div className="w-165 mx-auto">
        <div className="flex justify-between items-start gap-4 pb-8">
          <div className="space-y-2 text-left ml-2">
            <h1 className="text-4xl font-semibold font-serif tracking-tighter">
              Post your Dayli!
            </h1>
            <p className="text-sm text-foreground-secondary">Share how your day was</p>
          </div>
          {state.status === "ready" && !state.day.hasPosted && (
            <PostDeadlineCountdown deadlineAt={state.day.deadlineAt} serverNow={state.day.serverNow} />
          )}
        </div>

        {state.status === "error" && (
          <div className="p-8 bg-white rounded-2xl shadow-card space-y-4">
            <p role="alert" className="text-sm text-foreground-secondary">{state.message}</p>
            <Button
              type="button"
              onClick={() => void loadPostingDay()}
              variant={{ weight: "secondary", color: "accent" }}
            >
              Try again
            </Button>
          </div>
        )}

        {state.status === "ready" && state.day.hasPosted && (
          <div className="p-8 bg-white rounded-2xl shadow-card space-y-4">
            <p className="font-serif text-xl font-semibold tracking-tight">You&apos;ve posted today&apos;s dayli.</p>
            <p className="text-sm text-foreground-secondary">Come back tomorrow for a new prompt.</p>
            <Button href="/home" variant={{ weight: "secondary", color: "accent" }} arrow>
              Back to daylies
            </Button>
          </div>
        )}

        {state.status === "ready" && !state.day.hasPosted && (
          // Not keyed by day: a refreshed prompt must keep the author's draft text.
          <PostForm
            postingDay={state.day}
            onPostingDayChanged={() => void loadPostingDay()}
          />
        )}
      </div>
    </div>
  );
}

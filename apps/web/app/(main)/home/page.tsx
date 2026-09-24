"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { Button } from "@/components/ui/core/Button";
import { PostDeadlineCountdown } from "@/components/ui/PostDeadlineCountdown";
import { getCurrentPostingDay, type PostingDay } from "@/lib/api/daily-posts";

// The friends feed returns with the released-feed API (#19, #46). Until then
// home shows today's prompt and whether the author has posted.
export default function Home() {
  const router = useRouter();
  const { user, isPending } = useSession();
  const [day, setDay] = useState<PostingDay | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }
    let cancelled = false;
    void getCurrentPostingDay().then((result) => {
      if (cancelled) return;
      if (result.ok) setDay(result.value);
      else if (result.failure.kind === "unauthenticated") router.replace("/sign-in");
      else setUnavailable(true);
    });
    return () => { cancelled = true; };
  }, [isPending, router, user]);

  if (isPending || !user) return null;

  return (
    <section className="flex-1 w-full max-w-3xl mx-auto px-4 md:px-6 py-24">
      <div className="p-8 bg-white rounded-2xl shadow-card space-y-6">
        {day ? (
          <>
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-2">
                <p className="text-sm text-foreground-tertiary font-serif">today&apos;s prompt</p>
                <h1 className="text-3xl font-semibold font-serif tracking-tighter">{day.prompt.text}</h1>
              </div>
              {!day.hasPosted && <PostDeadlineCountdown deadlineAt={day.deadlineAt} serverNow={day.serverNow} />}
            </div>
            {day.hasPosted ? (
              <p className="text-foreground-secondary font-serif tracking-tight">
                You&apos;ve posted today&apos;s dayli. Your friends will see it after midnight.
              </p>
            ) : (
              <Button href="/post" variant={{ weight: "secondary", color: "accent" }} arrow>
                Post your dayli
              </Button>
            )}
          </>
        ) : (
          <p className="text-foreground-secondary font-serif tracking-tight">
            {unavailable ? "Today's prompt couldn't be loaded. Try again shortly." : "Loading today's prompt..."}
          </p>
        )}
      </div>
      <p className="pt-16 text-center text-lg text-foreground-secondary font-serif tracking-tight font-medium">
        Your friends&apos; daylies will appear here after midnight.
      </p>
    </section>
  );
}

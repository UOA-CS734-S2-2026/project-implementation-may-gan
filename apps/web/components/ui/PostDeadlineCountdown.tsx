"use client";

import { useEffect, useState } from "react";

interface TimeComponents {
  hours: string;
  minutes: string;
  seconds: string;
}

interface PostDeadlineCountdownProps {
  /** The server's deadline for today's post, from the posting-day API. */
  deadlineAt: Date;
  /** The server clock when the deadline was read, used to correct device clock skew. */
  serverNow: Date;
}

function toComponents(remainingMs: number): TimeComponents {
  const diff = Math.max(0, remainingMs);
  return {
    hours: String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, "0"),
    minutes: String(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))).padStart(2, "0"),
    seconds: String(Math.floor((diff % (1000 * 60)) / 1000)).padStart(2, "0"),
  };
}

export function PostDeadlineCountdown({ deadlineAt, serverNow }: PostDeadlineCountdownProps) {
  const [time, setTime] = useState<TimeComponents>({
    hours: "00",
    minutes: "00",
    seconds: "00",
  });

  const deadline = deadlineAt.getTime();
  const serverTime = serverNow.getTime();

  useEffect(() => {
    // Count down to the server deadline instead of the device's midnight, so
    // daylight-saving days and a wrong device clock cannot mislead the author.
    const skew = serverTime - Date.now();
    const tick = () => setTime(toComponents(deadline - (Date.now() + skew)));

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadline, serverTime]);

  return (
    <div className="flex gap-2 items-center justify-center font-serif">
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-semibold tracking-tight bg-background-accent text-foreground-accent">
          {time.hours}
        </div>
        <span className="text-sm text-foreground-secondary">hours</span>
      </div>
      <div className="h-12 flex items-center justify-center text-foreground-secondary font-semibold text-lg leading-none pb-6">
        :
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-semibold tracking-tight bg-background-accent text-foreground-accent">
          {time.minutes}
        </div>
        <span className="text-sm text-foreground-secondary">mins</span>
      </div>
      <div className="h-12 flex items-center justify-center text-foreground-secondary font-semibold text-lg leading-none pb-6">
        :
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-semibold tracking-tight bg-background-accent text-foreground-accent">
          {time.seconds}
        </div>
        <span className="text-sm text-foreground-secondary">secs</span>
      </div>
    </div>
  );
}

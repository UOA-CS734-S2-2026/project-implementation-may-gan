"use client";

import { useEffect, useState } from "react";

interface TimeComponents {
  hours: string;
  minutes: string;
  seconds: string;
}

export function PostDeadlineCountdown() {
  const [time, setTime] = useState<TimeComponents>({
    hours: "00",
    minutes: "00",
    seconds: "00",
  });

  useEffect(() => {
    function calculateTimeRemaining() {
      const now = new Date();

      const nzFormatter = new Intl.DateTimeFormat("en-NZ", {
        timeZone: "Pacific/Auckland",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const timeStr = nzFormatter.format(now);
      const [hour, minute, second] = timeStr.split(":").map(Number);

      const msSinceMidnightNZ = ((hour * 60 + minute) * 60 + second) * 1000;
      const diff = 24 * 60 * 60 * 1000 - msSinceMidnightNZ;

      if (diff <= 0) {
        setTime({ hours: "00", minutes: "00", seconds: "00" });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTime({
        hours: String(hours).padStart(2, "0"),
        minutes: String(minutes).padStart(2, "0"),
        seconds: String(seconds).padStart(2, "0"),
      });
    }

    calculateTimeRemaining();
    const id = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(id);
  }, []);

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

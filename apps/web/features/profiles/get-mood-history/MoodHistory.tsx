"use client";

import { useState } from "react";
import { Button } from "@/components/ui/core/Button";
import type { MoodHistory as MoodHistoryData, MoodRange } from "@/features/profiles/shared/profiles.api";
import { formatMoodDate, MoodChart } from "./MoodChart";
import { useMoodHistoryQuery } from "./use-mood-history-query";

const moodRanges: readonly MoodRange[] = ["30d", "90d", "1y"];

const rangeLabels: Record<MoodRange, { button: string; period: string }> = {
  "30d": { button: "30 days", period: "30 days" },
  "90d": { button: "90 days", period: "90 days" },
  "1y": { button: "Year", period: "year" },
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** One figure in the strip, laid out like the profile's own stats. */
function Stat({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div className="min-w-24 flex-1 text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-foreground-secondary">{label}</p>
      <p className="mt-1 text-[11px] text-foreground-tertiary">{detail}</p>
    </div>
  );
}

function Summaries({ history, range, isMe }: { history: MoodHistoryData; range: MoodRange; isMe: boolean }) {
  const { current, previous } = history;
  const period = rangeLabels[range].period;
  const change = current.average !== null && previous.average !== null
    ? Math.round((current.average - previous.average) * 10) / 10
    : null;
  const joinedInRange = history.trackedFrom > current.from;
  return (
    <div className="flex flex-wrap items-start justify-center gap-6 rounded-2xl bg-gray-100/80 px-6 py-4">
      <Stat
        value={current.average === null ? "–" : current.average.toFixed(1)}
        label="Average rating"
        detail={current.postedDays === 0 ? "No posts yet" : `From ${plural(current.postedDays, "post")}`}
      />
      <Stat
        value={change === null ? "–" : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change).toFixed(1)}`}
        label={`vs the ${period} before`}
        detail={previous.postedDays === 0
          ? "No posts then"
          : `${previous.average!.toFixed(1)} from ${plural(previous.postedDays, "post")}`}
      />
      <Stat
        value={String(current.missingDays)}
        label="Days without a post"
        detail={joinedInRange ? `Of ${plural(current.trackedDays, "day")} since ${isMe ? "you" : "they"} joined` : `Of ${plural(current.trackedDays, "day")}`}
      />
    </div>
  );
}

/**
 * A profile's ratings over time, in the place and style of the original web
 * app's weekly mood graph. It reaches the same people as the profile's posts:
 * the owner and their friends. It describes what was posted and makes no
 * claim about why; gaps and sample sizes stay visible.
 */
export function MoodHistory({ username, displayName, isMe }: { username: string; displayName: string; isMe: boolean }) {
  const [range, setRange] = useState<MoodRange>("30d");
  const query = useMoodHistoryQuery(username, range);
  const history = query.data;

  return (
    <section aria-labelledby="mood-history-heading" className="mx-auto mt-8 max-w-4xl space-y-4 rounded-2xl bg-background p-6 shadow-card sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="mood-history-heading" className="text-lg font-semibold tracking-tight">Mood</h2>
          <p className="text-xs text-foreground-secondary">
            {history ? `${formatMoodDate(history.current.from)} to ${formatMoodDate(history.current.to)} · ` : ""}
            {isMe ? "You and your friends can see this." : `Only ${displayName}'s friends can see this.`}
          </p>
        </div>
        <div role="radiogroup" aria-label="Time range" className="flex flex-wrap items-center gap-2">
          {moodRanges.map((option) => (
            <Button
              key={option}
              type="button"
              role="radio"
              aria-checked={range === option}
              onClick={() => setRange(option)}
              variant={{ weight: range === option ? "primary" : "secondary", color: "accent", size: "sm" }}
            >
              {rangeLabels[option].button}
            </Button>
          ))}
        </div>
      </div>

      {query.isError && !history && (
        <p role="status" className="text-sm text-foreground-secondary">This mood history couldn&apos;t be loaded. Try again later.</p>
      )}
      {query.isPending && <p className="text-sm text-foreground-tertiary">Loading mood…</p>}
      {history && (
        <div className={`flex flex-col gap-6 transition-opacity ${query.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={query.isPlaceholderData}>
          <Summaries history={history} range={range} isMe={isMe} />
          {history.days.length > 0 ? (
            <MoodChart from={history.current.from} to={history.current.to} trackedFrom={history.trackedFrom} days={history.days} hiddenDays={history.hiddenDays} />
          ) : (
            <p className="text-sm text-foreground-tertiary">{isMe ? "Post a dayli and your rating will show up here." : "No ratings to show in this range yet."}</p>
          )}
          {history.trackedFrom > history.current.from && (
            <p className="text-xs text-foreground-tertiary">{isMe ? "You" : displayName} joined on {formatMoodDate(history.trackedFrom)}, so earlier days aren&apos;t counted as missing.</p>
          )}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { moodRanges, type MoodHistory as MoodHistoryData, type MoodRange } from "@/features/profiles/shared/profiles.api";
import { formatMoodDate, MoodChart } from "./MoodChart";
import { useMoodHistoryQuery } from "./use-mood-history-query";

const rangeLabels: Record<MoodRange, { button: string; period: string }> = {
  "30d": { button: "30 days", period: "30 days" },
  "90d": { button: "90 days", period: "90 days" },
  "1y": { button: "Year", period: "year" },
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl bg-gray-100/80 px-5 py-4">
      <p className="font-sans text-xs text-foreground-secondary">{label}</p>
      <p className="mt-1 font-sans text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 font-sans text-xs text-foreground-tertiary">{detail}</p>
    </div>
  );
}

function Summaries({ history, range }: { history: MoodHistoryData; range: MoodRange }) {
  const { current, previous } = history;
  const period = rangeLabels[range].period;
  const change = current.average !== null && previous.average !== null
    ? Math.round((current.average - previous.average) * 10) / 10
    : null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile
        label="Average rating"
        value={current.average === null ? "–" : `${current.average.toFixed(1)}/10`}
        detail={current.postedDays === 0 ? "No posts yet in this range" : `From ${plural(current.postedDays, "post")}`}
      />
      <Tile
        label={`Compared with the ${period} before`}
        value={change === null ? "–" : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change).toFixed(1)}`}
        detail={previous.postedDays === 0
          ? `No posts in the ${period} before`
          : `${previous.average!.toFixed(1)}/10 from ${plural(previous.postedDays, "post")}`}
      />
      <Tile
        label="Days without a post"
        value={String(current.missingDays)}
        detail={current.trackedDays < dayCount(current.from, current.to)
          ? `Of ${plural(current.trackedDays, "day")} since you joined`
          : `Of ${plural(current.trackedDays, "day")}`}
      />
    </div>
  );
}

function dayCount(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * The owner's ratings over time, on their own profile only. It describes what
 * was posted and makes no claim about why; gaps and sample sizes stay visible.
 */
export function MoodHistory() {
  const [range, setRange] = useState<MoodRange>("30d");
  const query = useMoodHistoryQuery(range);
  const history = query.data;

  return (
    <section aria-labelledby="mood-history-heading" className="mx-auto mt-8 max-w-4xl rounded-2xl bg-background p-6 shadow-card sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="mood-history-heading" className="font-serif text-2xl font-semibold tracking-tighter">Your mood</h2>
          <p className="mt-1 font-sans text-sm text-foreground-secondary">Your daily ratings. Only you can see this.</p>
        </div>
        <div role="radiogroup" aria-label="Time range" className="flex rounded-full bg-gray-100/80 p-1">
          {moodRanges.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={range === option}
              onClick={() => setRange(option)}
              className={`rounded-full px-3 py-1 font-sans text-sm transition ${range === option ? "bg-background font-semibold text-foreground shadow-sm" : "text-foreground-secondary hover:text-foreground"}`}
            >
              {rangeLabels[option].button}
            </button>
          ))}
        </div>
      </div>

      {query.isError && !history && (
        <p role="status" className="mt-6 font-sans text-sm text-foreground-secondary">Your mood history couldn&apos;t be loaded. Try again later.</p>
      )}
      {query.isPending && <p className="mt-6 font-sans text-sm text-foreground-tertiary">Loading your mood…</p>}
      {history && (
        <div className={`mt-6 flex flex-col gap-6 transition-opacity ${query.isPlaceholderData ? "opacity-60" : ""}`} aria-busy={query.isPlaceholderData}>
          <Summaries history={history} range={range} />
          {history.days.length > 0 ? (
            <MoodChart from={history.current.from} to={history.current.to} days={history.days} />
          ) : (
            <p className="font-sans text-sm text-foreground-tertiary">Post a dayli and your rating will show up here.</p>
          )}
          {history.trackedFrom > history.current.from && (
            <p className="font-sans text-xs text-foreground-tertiary">You joined on {formatMoodDate(history.trackedFrom, "long")}, so earlier days aren&apos;t counted as missing.</p>
          )}
          {history.days.length > 0 && (
            <details className="font-sans text-sm">
              <summary className="cursor-pointer text-foreground-secondary">Show as a table</summary>
              <table className="mt-3 w-full max-w-sm text-left">
                <thead>
                  <tr className="text-xs text-foreground-tertiary">
                    <th scope="col" className="py-1 font-normal">Day</th>
                    <th scope="col" className="py-1 text-right font-normal">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history.days].reverse().map((day) => (
                    <tr key={day.localDate} className="border-t border-foreground/10">
                      <td className="py-1">{formatMoodDate(day.localDate, "long")}</td>
                      <td className="py-1 text-right tabular-nums">{day.rating}/10</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

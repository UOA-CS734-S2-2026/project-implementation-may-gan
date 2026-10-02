"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

export type MoodPoint = { localDate: string; rating: number };

const TICKS = [1, 4, 7, 10];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days since 1970-01-01; `YYYY-MM-DD` carries no zone, so UTC is exact. */
function dayNumber(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

/** Dates as the original web app's mood graph wrote them, e.g. "02 Oct 2026". */
export function formatMoodDate(date: string, style: "short" | "long" = "long") {
  return new Intl.DateTimeFormat("en-NZ", style === "long"
    ? { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/** Rating as a fraction of the plot height from the top. */
const top = (rating: number) => (10 - rating) / 9;
const percent = (fraction: number) => `${fraction * 100}%`;

/**
 * Daily ratings over a fixed window. The line only joins consecutive days, so
 * a day without a post shows as a gap rather than an invented value.
 *
 * The SVG stretches to the plot and only draws strokes that don't scale; dots
 * and text are HTML placed by percentage, so they keep their size at any width.
 */
export function MoodChart({ from, to, trackedFrom, days, hiddenDays = [] }: {
  from: string;
  to: string;
  trackedFrom: string;
  days: readonly MoodPoint[];
  /** Days with a post the viewer can't see. They are neither rated nor missing. */
  hiddenDays?: readonly string[];
}) {
  const [active, setActive] = useState<number | null>(null);
  const start = dayNumber(from);
  const span = Math.max(1, dayNumber(to) - start);
  const points = days.map((day) => {
    const number = dayNumber(day.localDate);
    return { ...day, day: number, x: (number - start) / span, y: top(day.rating) };
  });

  // Runs of consecutive days become one polyline each.
  const runs: (typeof points)[] = [];
  for (const point of points) {
    const run = runs.at(-1);
    if (run && point.day === run.at(-1)!.day + 1) run.push(point);
    else runs.push([point]);
  }
  // Over long ranges dots would merge into a band, so only lone days keep one.
  const dense = span > 90;
  const lone = new Set(runs.filter((run) => run.length === 1).map((run) => run[0]!.localDate));
  // As in the original graph, a tracked day without any post gets an empty
  // circle on the baseline. Today is still open, so it never gets one.
  const posted = new Set([...points.map((point) => point.day), ...hiddenDays.map(dayNumber)]);
  const missing: number[] = [];
  if (!dense) {
    for (let day = Math.max(start, dayNumber(trackedFrom)); day < dayNumber(to); day += 1) {
      if (!posted.has(day)) missing.push((day - start) / span);
    }
  }

  function nearest(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    let best: number | null = null;
    for (const [index, point] of points.entries()) {
      if (best === null || Math.abs(point.x - fraction) < Math.abs(points[best]!.x - fraction)) best = index;
    }
    return best;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step = event.key === "ArrowRight" ? 1 : -1;
      setActive((current) => Math.min(points.length - 1, Math.max(0, (current ?? (step > 0 ? -1 : points.length)) + step)));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const focused = active === null ? null : points[active];
  return (
    <div className="pl-7 pr-2">
      <div
        className="relative h-44 touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
        role="img"
        aria-label={`Daily ratings from ${formatMoodDate(from)} to ${formatMoodDate(to)}. Use the arrow keys to read each day.`}
        tabIndex={points.length > 0 ? 0 : -1}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerMove={(event) => setActive(nearest(event))}
        onPointerLeave={() => setActive(null)}
      >
        {TICKS.map((tick) => (
          <span
            key={tick}
            aria-hidden
            className="absolute -left-2 -translate-x-full -translate-y-1/2 font-sans text-[11px] leading-none text-foreground/50"
            style={{ top: percent(top(tick)) }}
          >
            {tick}
          </span>
        ))}
        <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden>
          {TICKS.map((tick) => (
            <line key={tick} x1={0} x2={1000} y1={top(tick) * 1000} y2={top(tick) * 1000} className="stroke-foreground/10" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {focused && (
            <line x1={focused.x * 1000} x2={focused.x * 1000} y1={0} y2={1000} className="stroke-foreground/30" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
          {runs.filter((run) => run.length > 1).map((run) => (
            <polyline
              key={run[0]!.localDate}
              points={run.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" ")}
              fill="none"
              className="stroke-accent"
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {missing.map((x) => (
          <span
            key={x}
            data-mood-missing
            aria-hidden
            className="absolute top-full size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/30 bg-background"
            style={{ left: percent(x) }}
          />
        ))}
        {points.map((point, index) => (dense && !lone.has(point.localDate) && index !== active ? null : (
          <span
            key={point.localDate}
            data-mood-dot
            aria-hidden
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground-accent ring-2 ring-background ${index === active ? "size-3" : "size-2"}`}
            style={{ left: percent(point.x), top: percent(point.y) }}
          />
        )))}
        {focused && (
          <div
            role="status"
            className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-md bg-background-accent px-3 py-1 font-sans text-[11px] text-foreground-accent ${focused.x > 0.75 ? "-translate-x-full -ml-3" : focused.x < 0.25 ? "ml-3" : "-translate-x-1/2"} bottom-full mb-2`}
            style={{ left: percent(focused.x) }}
          >
            {formatMoodDate(focused.localDate)}: Rating of {focused.rating}
          </div>
        )}
      </div>
      <div aria-hidden className="mt-3 flex justify-between font-sans text-[11px] text-foreground/60">
        <span>{formatMoodDate(from, "short")}</span>
        <span>{formatMoodDate(to, "short")}</span>
      </div>
    </div>
  );
}

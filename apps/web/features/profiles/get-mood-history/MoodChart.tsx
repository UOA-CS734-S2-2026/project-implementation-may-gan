"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";

export type MoodPoint = { localDate: string; rating: number };

const TICKS = [1, 5, 10];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days since 1970-01-01; `YYYY-MM-DD` carries no zone, so UTC is exact. */
function dayNumber(date: string) {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

export function formatMoodDate(date: string, style: "short" | "long" = "short") {
  return new Intl.DateTimeFormat("en-NZ", style === "long"
    ? { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
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
export function MoodChart({ from, to, days }: { from: string; to: string; days: readonly MoodPoint[] }) {
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
        aria-label={`Daily ratings from ${formatMoodDate(from, "long")} to ${formatMoodDate(to, "long")}. Use the arrow keys to read each day.`}
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
            className="absolute -left-2 -translate-x-full -translate-y-1/2 font-sans text-[11px] leading-none text-foreground-tertiary"
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
              className="stroke-violet-500"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {points.map((point, index) => (dense && !lone.has(point.localDate) && index !== active ? null : (
          <span
            key={point.localDate}
            data-mood-dot
            aria-hidden
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500 ring-2 ring-background ${index === active ? "size-3" : "size-2"}`}
            style={{ left: percent(point.x), top: percent(point.y) }}
          />
        )))}
        {focused && (
          <div
            role="status"
            className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-background px-3 py-2 shadow-card ${focused.x > 0.75 ? "-translate-x-full -ml-3" : focused.x < 0.25 ? "ml-3" : "-translate-x-1/2"} ${focused.y < 0.5 ? "top-full mt-2" : "top-0"}`}
            style={{ left: percent(focused.x) }}
          >
            <p className="font-sans text-sm font-semibold text-foreground">{focused.rating}/10</p>
            <p className="font-sans text-xs text-foreground-secondary">{formatMoodDate(focused.localDate, "long")}</p>
          </div>
        )}
      </div>
      <div aria-hidden className="mt-2 flex justify-between font-sans text-[11px] text-foreground-tertiary">
        <span>{formatMoodDate(from)}</span>
        <span>{formatMoodDate(to)}</span>
      </div>
    </div>
  );
}

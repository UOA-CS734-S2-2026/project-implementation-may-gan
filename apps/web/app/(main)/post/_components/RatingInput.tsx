"use client";

import {
  useController,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";
import clsx from "clsx";

const MIN = 1;
const MAX = 10;

/**
 * A 1–10 slider that starts unset, so a rating is always chosen on purpose.
 * A native range input always has a value, so the first click, drag, or key
 * press is what sets it.
 */
export default function RatingInput<T extends FieldValues>(
  controllerProps: UseControllerProps<T>
) {
  const {
    field: { name, value, onChange, onBlur, ref },
    fieldState,
  } = useController(controllerProps);
  const rated = typeof value === "number";
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;

  // Clicking or pressing a key where the thumb already sits fires no change
  // event, so an unset rating is taken from the input on interaction too.
  const claim = (input: HTMLInputElement) => {
    if (!rated) onChange(Number(input.value));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={name} className="text-sm font-medium font-sans">
          Day rating
        </label>
        <span className="font-serif text-lg font-semibold text-foreground-accent">
          {rated ? `${value}/${MAX}` : ""}
        </span>
      </div>
      <input
        id={name}
        name={name}
        ref={ref}
        type="range"
        min={MIN}
        max={MAX}
        step={1}
        value={rated ? value : MIN}
        aria-valuetext={rated ? `${value} out of ${MAX}` : "Not rated yet"}
        aria-invalid={fieldState.invalid}
        aria-describedby={fieldState.error ? errorId : hintId}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={(event) => claim(event.currentTarget)}
        onKeyUp={(event) => claim(event.currentTarget)}
        onBlur={onBlur}
        className={clsx(
          "w-full cursor-pointer",
          rated ? "accent-foreground-accent" : "accent-foreground-tertiary",
          fieldState.invalid && "rounded-full ring-2 ring-danger/50"
        )}
      />
      <div className="flex justify-between text-sm text-foreground-tertiary">
        <span>{MIN}</span>
        {!rated && <span id={hintId}>Slide to rate your day</span>}
        <span>{MAX}</span>
      </div>
      {fieldState.error && (
        <p id={errorId} className="text-sm text-red-500">
          {fieldState.error.message}
        </p>
      )}
    </div>
  );
}

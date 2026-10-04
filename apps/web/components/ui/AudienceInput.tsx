"use client";

import {
  useController,
  type FieldValues,
  type UseControllerProps,
} from "react-hook-form";
import clsx from "clsx";
import { BiGroup, BiLockAlt } from "react-icons/bi";
import type { PostAudience } from "@/lib/api/daily-posts";

const options: Array<{
  value: PostAudience;
  title: string;
  description: string;
  Icon: typeof BiGroup;
}> = [
  {
    value: "friends",
    title: "Friends",
    description: "Your friends see it after midnight.",
    Icon: BiGroup,
  },
  {
    value: "solo",
    title: "Solo",
    description: "Only you can see it.",
    Icon: BiLockAlt,
  },
];

/** Solo or friends, with nothing chosen until the author picks one. */
export default function AudienceInput<T extends FieldValues>(
  controllerProps: UseControllerProps<T>
) {
  const { field, fieldState } = useController(controllerProps);
  const errorId = `${field.name}-error`;

  return (
    <fieldset
      className="space-y-2"
      aria-invalid={fieldState.invalid}
      aria-describedby={fieldState.error ? errorId : undefined}
    >
      <legend className="text-sm font-medium font-sans pb-2">
        Who can see this
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {options.map(({ value, title, description, Icon }) => {
          const selected = field.value === value;
          return (
            <label
              key={value}
              className={clsx(
                "flex cursor-pointer flex-col gap-1 rounded-xl p-4 transition-colors focus-within:ring-2 focus-within:ring-foreground/20",
                selected
                  ? "bg-foreground-accent text-white"
                  : "bg-background-secondary",
                fieldState.invalid && "ring-2 ring-danger/50"
              )}
            >
              <input
                type="radio"
                name={field.name}
                value={value}
                checked={selected}
                onChange={() => field.onChange(value)}
                onBlur={field.onBlur}
                ref={selected ? field.ref : undefined}
                className="sr-only"
              />
              <Icon className="text-xl" aria-hidden />
              <span className="font-serif text-lg font-semibold">{title}</span>
              <span
                className={clsx(
                  "text-sm",
                  selected ? "text-white/85" : "text-foreground-secondary"
                )}
              >
                {description}
              </span>
            </label>
          );
        })}
      </div>
      {fieldState.error && (
        <p id={errorId} className="text-sm text-red-500">
          {fieldState.error.message}
        </p>
      )}
    </fieldset>
  );
}

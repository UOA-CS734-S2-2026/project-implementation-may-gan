"use client";

import {
  useController,
  UseControllerProps,
  FieldValues,
} from "react-hook-form";
import { tv, type VariantProps } from "tailwind-variants";

const input = tv({
  slots: {
    wrapper: "space-y-2",
    label: "text-sm font-medium font-sans",
    inputWrap: "relative",
    base: "w-full bg-background px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 rounded-md",
    prefix:
      "pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-foreground/40",
    errorMsg: "text-sm text-red-500",
  },
  variants: {
    variant: {
      auth: {
        base: "bg-background-secondary",
      },
      posts: {
        base: "border-none",
        inputWrap: "pt-1 ml-[-3px]",
      },
      // add new variants here as designs come in e.g:
      // post: {
      //   base: "text-base border-2 border-amber-500",
      // },
    },
    invalid: {
      true: {
        base: "ring-2 ring-danger/50",
      },
      false: {
        base: "focus:ring-foreground/20",
      },
    },
    hasPrefix: {
      true: { base: "pl-7" },
    },
  },
  defaultVariants: {
    variant: "auth",
    invalid: false,
  },
});

type FormInputVariant = VariantProps<typeof input>["variant"];

type FormInputProps<T extends FieldValues> = UseControllerProps<T> & {
  label: string;
  variant?: FormInputVariant;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  prefix?: string;
  multiline?: boolean;
  rows?: number;
};

export function FormInput<T extends FieldValues>({
  label,
  variant = "auth",
  type = "text",
  autoComplete,
  placeholder,
  prefix,
  multiline,
  rows = 4,
  ...controllerProps
}: FormInputProps<T>) {
  const { field, fieldState } = useController(controllerProps);
  const {
    wrapper,
    label: labelClass,
    inputWrap,
    base,
    prefix: prefixClass,
    errorMsg,
  } = input({
    variant,
    invalid: fieldState.invalid,
    hasPrefix: !!prefix,
  });

  return (
    <div className={wrapper()}>
      <label htmlFor={field.name} className={labelClass()}>
        {label}
      </label>
      <div className={inputWrap()}>
        {prefix && <span className={prefixClass()}>{prefix}</span>}
        {multiline ? (
          <textarea
            {...field}
            value={field.value ?? ""}
            id={field.name}
            autoComplete={autoComplete}
            placeholder={placeholder}
            className={base({ className: "resize-none" })}
            rows={rows}
          />
        ) : (
          <input
            {...field}
            value={field.value ?? ""}
            id={field.name}
            type={type}
            autoComplete={autoComplete}
            placeholder={placeholder}
            className={base()}
          />
        )}
      </div>
      {fieldState.error && (
        <p className={errorMsg()}>{fieldState.error.message}</p>
      )}
    </div>
  );
}

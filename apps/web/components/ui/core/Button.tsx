"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";
import Link, { LinkProps } from "next/link";
import { type VariantProps, tv } from "tailwind-variants";
import { cn } from "@/utils/cn";

import Arrow from "@/assets/Arrow";

/**
 * General button component for navigation and click actions.
 *
 * Takes the following parameters as props of variants:
 * @variation weight [primary, secondary] - the general style and importance of the button.
 * @variation color [accent, foreground, background] - the color of the button. Takes from main tokens.
 * @variation typeface [serif, sans] - whether we use the primary serif or sans font.
 * @variation size [sm, md, lg] - the size of the button.
 * @variation width [full, fit] - whether the element scales to the full width of the parent.
 * @variation arrow [true, false] - whether the button has a corresponding arrow.
 *
 * example usage:
 * <Button variant={{ style: "primary", color: "wdcc", width: {full}, arrow: {true} }}>primary blue</Button>
 *
 * Labels are provided as children of this element.
 * This Button dynamically determines its element type as either <button/> or <Link/> depending on the optional href attribute.
 */

const button = tv({
  base: "group flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-all duration-[400ms] hover:duration-[200ms] hover:cursor-pointer",
  variants: {
    /* Realistically we probably don't need to codify the whole style/color variant split since there's so few buttons and basically no variants, but whatever.  */
    weight: {
      primary: "",
      secondary: "",
    },
    color: {
      accent: "",
      foreground: "",
      background: "",
    },
    typeface: {
      serif: "font-serif tracking-[-0.05em]",
      sans: "font-sans font-medium tracking-tight",
    },
    size: {
      sm: "text-sm px-4 pt-[7px] pb-[6px] ",
      md: "px-6 pt-[8px] pb-[7px] ",
      lg: "text-lg px-6 pt-[10px] pb-[8px] ",
    },
    width: {
      full: "w-full",
      fit: "w-fit",
    },
  },
  defaultVariants: {
    weight: "primary",
    color: "accent",
    width: "fit",
    size: "md",
    typeface: "serif",
  },
  compoundVariants: [
    {
      weight: "primary",
      color: "accent",
      class: "bg-foreground-accent text-white hover:bg-purple-900",
    },
    {
      weight: "secondary",
      color: "accent",
      class: "bg-background-accent text-foreground-accent hover:bg-purple-200",
    },
    {
      weight: "primary",
      color: "foreground",
      class: "bg-foreground text-white hover:bg-neutral-900",
    },
    {
      weight: "secondary",
      color: "foreground",
      class: "bg-background-tertiary text-foreground hover:bg-taupe-300",
    },
    {
      weight: "primary",
      color: "background",
      class: "border border-foreground hover:bg-taupe-100",
    },
    {
      weight: "secondary",
      color: "background",
      class: "border border-foreground-tertiary hover:bg-taupe-100",
    },
  ],
});

type CommonProps = {
  children: ReactNode;
  arrow?: boolean;
};

type Variant = { variant?: VariantProps<typeof button> };

// Type if rendered as a button (no href provided)
type ButtonVersionProps = Variant &
  ButtonHTMLAttributes<HTMLButtonElement> &
  CommonProps & { href?: never };

// Type if rendered as a Link (href provided)
type LinkVersionProps = Variant &
  LinkProps &
  CommonProps & { href: string; newTab?: boolean; className?: string };

// Type guard to determine if the props are for a Link or Button
function isLinkProps(
  props: ButtonVersionProps | LinkVersionProps
): props is LinkVersionProps {
  return props.href !== undefined;
}

function Button(props: ButtonVersionProps | LinkVersionProps) {
  // Conditionally render as Link or button depending on whether a local link (href attribute) is provided.
  if (isLinkProps(props)) {
    // Is Link (default to newTab if newTab undefined & href is external)
    const {
      children,
      href,
      className,
      newTab = href.startsWith("http"),
      arrow,
      ...rest
    } = props;
    return (
      <Link
        {...rest}
        href={href}
        className={cn(button(props.variant), className)}
        target={newTab ? "_blank" : "_self"}
      >
        {children}
        {arrow && (
          <Arrow className="group-hover:animate-[arrow-anim_2s_ease-in-out_infinite]" />
        )}
      </Link>
    );
  } else {
    // Is button
    const { children, className, arrow, ...buttonProps } = props;
    return (
      <button {...buttonProps} className={cn(button(props.variant), className)}>
        {children}
        {arrow && (
          <Arrow className="group-hover:animate-[arrow-anim_2s_ease-in-out_infinite]" />
        )}
      </button>
    );
  }
}

export { Button };

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export function NavLink({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const linkStyle =
    "transition hover:text-foreground hover:fill-foreground data-[active=true]:text-foreground flex gap-4 items-center fill-foreground-secondary data-[active=true]:fill-foreground";

  const isActive = exact
    ? pathname === href
    : pathname === href || (pathname?.startsWith(href) && href !== "/");

  return (
    <Link
      href={href}
      className={linkStyle}
      data-active={isActive ? "true" : undefined}
    >
      {children}
    </Link>
  );
}

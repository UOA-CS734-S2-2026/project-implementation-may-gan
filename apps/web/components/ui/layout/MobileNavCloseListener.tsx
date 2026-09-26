"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function MobileNavCloseListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const checkbox = document.getElementById(
      "mobile-nav-toggle"
    ) as HTMLInputElement | null;
    if (checkbox && checkbox.checked) {
      checkbox.checked = false;
    }
  }, [pathname, searchParams]);

  return null;
}

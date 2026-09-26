"use client";

import { useState } from "react";
import { useTheme } from "@/lib/theme/provider";
import { THEMES, type ThemeId } from "@/themes/registry";

export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground transition-colors hover:bg-card"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Choose theme"
      >
        Theme: {THEMES.find((t) => t.id === theme)?.name ?? theme}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            aria-hidden
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            className="absolute right-0 top-full z-20 mt-1 min-w-40 rounded-lg border border-border bg-surface py-1 shadow-lg shadow-black/20"
          >
            {THEMES.map((t) => (
              <li key={t.id} role="option" aria-selected={theme === t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTheme(t.id as ThemeId);
                    setOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-card"
                >
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface UserSearchResult {
  id: string;
  name: string;
  username: string;
  image: string | null;
}

// User search arrives with the profile API (#68). Until then every search
// settles with no results.
function useUserSearch(query: string, enabled: boolean) {
  const results: UserSearchResult[] | undefined = enabled && query ? [] : undefined;
  return { data: results, isPending: false };
}

export function NavSearch() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debounced.length >= 2;
  const { data: results, isPending } = useUserSearch(debounced, enabled);
  const loading = enabled && (isPending || !results);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const showDropdown = open && enabled;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="search users…"
        className="w-full rounded-xl bg-background-secondary pr-6 pl-[54px] py-3 text-sm text-foreground placeholder:text-foreground-tertiary outline-none focus:ring-2 focus:ring-accent
        bg-[url('/searchicon.svg')] bg-no-repeat bg-position-[24px_10px] "
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg bg-background shadow-nav border border-foreground/20 max-h-80 overflow-y-auto px-2 py-2">
          {loading && (
            <div className="px-3 py-2 text-xs text-foreground-tertiary">
              searching…
            </div>
          )}
          {!loading && results && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-foreground-tertiary">
              no users found
            </div>
          )}
          {results?.map((u) => (
            <Link
              key={u.id}
              href={`/${u.username}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-background-secondary transition-colors rounded-lg"
            >
              {u.image ? (
                <Image
                  src={u.image}
                  alt={u.name || u.username}
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-full bg-background-accent" />
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm text-foreground truncate">
                  {u.name}
                </span>
                <span className="text-xs text-foreground-tertiary truncate">
                  @{u.username}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session/hooks";
import { searchFriends } from "@/lib/api/friends";

/** WDCC-style global handle search, deliberately limited to the safe discovery card. */
export function NavSearch() {
  const { user } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(query.trim()), 250); return () => window.clearTimeout(timer); }, [query]);
  const enabled = debounced.length >= 2;
  const results = useQuery({ queryKey: ["social-search", user?.id ?? "anonymous", debounced], enabled, retry: false, queryFn: async () => { const response = await searchFriends(debounced); if (!response.ok) throw new Error(response.failure); return response.value.items; } });
  useEffect(() => { const close = (event: MouseEvent) => { if (!containerRef.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  const items = results.data ?? [];
  return <div ref={containerRef} className="relative">
    <input aria-label="search users" value={query} onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(-1); }} onFocus={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "ArrowDown") { event.preventDefault(); setActive((current) => Math.min(current + 1, items.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setActive((current) => Math.max(current - 1, 0)); } if (event.key === "Enter" && active >= 0) { event.preventDefault(); router.push(`/${items[active]!.username}`); } }} placeholder="search users…" className="w-full rounded-xl bg-background-secondary pr-6 pl-[54px] py-3 text-sm text-foreground placeholder:text-foreground-tertiary outline-none focus:ring-2 focus:ring-accent bg-[url('/searchicon.svg')] bg-no-repeat bg-position-[24px_10px]" />
    {open && enabled && <div role="listbox" aria-label="Search results" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-foreground/20 bg-background px-2 py-2 shadow-nav">
      {results.isPending && <p className="px-3 py-2 text-xs text-foreground-tertiary">searching…</p>}
      {results.isError && <p className="px-3 py-2 text-xs text-foreground-tertiary">search is unavailable</p>}
      {!results.isPending && !results.isError && items.length === 0 && <p className="px-3 py-2 text-xs text-foreground-tertiary">no users found</p>}
      {items.map((person, index) => <Link key={person.id} role="option" aria-selected={active === index} href={`/${person.username}`} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${active === index ? "bg-background-secondary" : "hover:bg-background-secondary"}`}><span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-background-accent font-serif text-foreground-accent">{person.displayName.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-sm text-foreground">{person.displayName}</span><span className="block truncate text-xs text-foreground-tertiary">@{person.username}</span></span></Link>)}
    </div>}
  </div>;
}

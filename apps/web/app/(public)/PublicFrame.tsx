"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/core/Button";
import { AppShell } from "@/components/ui/layout/AppShell";
import { useSession } from "@/lib/session/hooks";

/** Signed-in people keep the app sidebar on public pages; visitors get the public header. */
export function PublicFrame({ children }: { children: React.ReactNode }) {
  const { user, isPending } = useSession();
  // Wait for the session so neither frame flashes before the right one.
  if (isPending) return <main className="min-h-screen bg-background" />;
  if (user) return <AppShell>{children}</AppShell>;
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <header className="relative z-10 border-b border-foreground/10 bg-background/95">
        <div className="mx-auto flex h-20 max-w-[1100px] items-center justify-between px-6">
          <Link href="/" aria-label="Dayli home">
            <Image src="/dayli-logo.svg" width={100} height={51} alt="Dayli" priority />
          </Link>
          <Button href="/sign-in" variant={{ weight: "secondary", color: "accent", size: "sm" }}>Sign in</Button>
        </div>
      </header>
      <div className="relative z-[1]">{children}</div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-[-50%] bg-[url('/dotgridbg.jpg')] bg-[50%] opacity-50" />
      </div>
    </main>
  );
}

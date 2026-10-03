import Image from "next/image";
import { Suspense } from "react";
import Link from "next/link";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { PublicAccountLink } from "./PublicAccountLink";
import { PublicIntentUsernameGate } from "./PublicIntentUsernameGate";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <Suspense fallback={null}><PublicIntentUsernameGate /></Suspense>
      <main className="relative min-h-screen overflow-hidden bg-background">
        <header className="relative z-10 border-b border-foreground/10 bg-background/95">
          <div className="mx-auto flex h-20 max-w-[1100px] items-center justify-between px-6">
            <Link href="/" aria-label="Dayli home">
              <Image src="/dayli-logo.svg" width={100} height={51} alt="Dayli" priority />
            </Link>
            <PublicAccountLink />
          </div>
        </header>
        <div className="relative z-[1]">{children}</div>
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute inset-[-50%] bg-[url('/dotgridbg.jpg')] bg-[50%] opacity-50" />
        </div>
      </main>
    </QueryProvider>
  );
}

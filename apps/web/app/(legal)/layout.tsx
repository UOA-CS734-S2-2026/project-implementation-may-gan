import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="legal-page min-h-screen bg-background">
      <header className="border-b border-foreground/10 bg-background/95 px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <Link href="/" className="rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground-accent">
            <Image src="/dayli-logo.svg" width={110} height={57} alt="Dayli home" priority />
          </Link>
          <LegalLinks className="text-sm text-foreground-secondary" />
        </div>
      </header>
      {children}
    </main>
  );
}

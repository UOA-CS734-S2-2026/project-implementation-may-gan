import { Navbar } from "@/components/ui/layout/Navbar";
import { MobileNavCloseListener } from "@/components/ui/layout/MobileNavCloseListener";
import { Suspense } from "react";
import { MessagingProvider } from "@/features/messaging/realtime/MessagingProvider";
import { UsernameSetupGate } from "@/components/auth/UsernameSetupGate";
import { RestrictedLegalGate } from "@/components/legal/RestrictedLegalGate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RestrictedLegalGate><UsernameSetupGate><MessagingProvider><main className="min-h-screen flex w-full bg-background">
      {/* Left: navbar */}
      <div className="fixed flex-none z-10">
        <Navbar />
      </div>

      {/* Right: main content */}
      <div className="relative w-full flex-1 pt-20 md:pl-[300px] md:pt-0">
        <div className="relative z-[1]">{children}</div>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-[-50%] bg-[url('/dotgridbg.jpg')] bg-[50%] opacity-50"></div>
        </div>
      </div>
      <Suspense fallback={null}>
        <MobileNavCloseListener />
      </Suspense>
    </main></MessagingProvider></UsernameSetupGate></RestrictedLegalGate>
  );
}

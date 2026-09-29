import { Navbar } from "@/components/ui/layout/Navbar";
import { MobileNavCloseListener } from "@/components/ui/layout/MobileNavCloseListener";
import { Suspense } from "react";
import { MessagingProvider } from "@/features/messaging/realtime/MessagingProvider";
import { UsernameSetupGate } from "@/components/auth/UsernameSetupGate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UsernameSetupGate><main className="min-h-screen flex w-full bg-background">
      {/* Left: navbar */}
      <div className="fixed flex-none z-10">
        <Navbar />
      </div>

      {/* Right: main content */}
      <div className="relative md:pl-[300px] w-full flex-1">
        <MessagingProvider><div className="relative z-[1]">{children}</div></MessagingProvider>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-[-50%] bg-[url('/dotgridbg.jpg')] bg-[50%] opacity-50"></div>
        </div>
      </div>
      <Suspense fallback={null}>
        <MobileNavCloseListener />
      </Suspense>
    </main></UsernameSetupGate>
  );
}

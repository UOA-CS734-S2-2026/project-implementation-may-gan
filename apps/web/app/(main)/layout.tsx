import { AppShell } from "@/components/ui/layout/AppShell";
import { Suspense } from "react";
import { MessagingProvider } from "@/features/messaging/realtime/MessagingProvider";
import { UsernameSetupGate } from "@/components/auth/UsernameSetupGate";
import { LegalAcceptanceGate } from "@/components/auth/LegalAcceptanceGate";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}><LegalAcceptanceGate><UsernameSetupGate><MessagingProvider><AppShell>{children}</AppShell></MessagingProvider></UsernameSetupGate></LegalAcceptanceGate></Suspense>
  );
}

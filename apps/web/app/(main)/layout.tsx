import { AppShell } from "@/components/ui/layout/AppShell";
import { Suspense } from "react";
import { MessagingProvider } from "@/features/messaging/realtime/MessagingProvider";
import { ProtectedAppGate } from "@/components/auth/ProtectedAppGate";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}><ProtectedAppGate><MessagingProvider><AppShell>{children}</AppShell></MessagingProvider></ProtectedAppGate></Suspense>
  );
}

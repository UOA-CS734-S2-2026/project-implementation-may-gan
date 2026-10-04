import { Suspense } from "react";
import { MessagingProvider } from "@/features/messaging/realtime/MessagingProvider";
import { PublicFrame } from "./PublicFrame";
import { PublicIntentUsernameGate } from "./PublicIntentUsernameGate";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <MessagingProvider>
      <Suspense fallback={null}><PublicIntentUsernameGate /></Suspense>
      <PublicFrame>{children}</PublicFrame>
    </MessagingProvider>
  );
}

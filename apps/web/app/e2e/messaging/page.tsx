import { notFound } from "next/navigation";
import { MessagingHarness } from "@/features/messaging/e2e/MessagingHarness";

export default function MessagingE2EPage() {
  if (process.env.E2E_MESSAGING !== "1") notFound();
  return <MessagingHarness />;
}

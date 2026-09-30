import { redirect } from "next/navigation";
import LandingPage from "./LandingPage";
import { apiBaseUrl } from "@/lib/api/config";

export const dynamic = "force-dynamic";

export default async function Landing({ searchParams }: { searchParams: Promise<{ landing?: string }> }) {
  const { landing } = await searchParams;
  if (landing === "signed-out" || !apiBaseUrl) return <LandingPage />;

  redirect(new URL("/api/auth/landing", apiBaseUrl).toString());
}

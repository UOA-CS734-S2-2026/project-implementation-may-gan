import { apiBaseUrl } from "@/lib/api/config";

export type UsernameProfile = {
  username: string | null;
  publicName: string | null;
  needsUsernameSetup: boolean;
};

export async function getUsernameProfile(): Promise<UsernameProfile> {
  const response = await fetch(`${apiBaseUrl}/api/v1/profile/username`, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Unable to read username setup state.");
  return response.json() as Promise<UsernameProfile>;
}

export async function claimInitialUsername(username: string, publicName: string): Promise<UsernameProfile> {
  const response = await fetch(`${apiBaseUrl}/api/v1/profile/username`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, publicName: publicName.trim() || undefined }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? "Unable to claim that username.");
  }
  return response.json() as Promise<UsernameProfile>;
}

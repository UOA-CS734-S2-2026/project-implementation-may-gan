import { Configuration } from "@dayli/api-client";

/** The Hono API origin. Browser calls include the Better Auth session cookie. */
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || undefined;

export function apiConfiguration(): Configuration | undefined {
  if (!apiBaseUrl) return undefined;
  return new Configuration({ basePath: apiBaseUrl, credentials: "include" });
}

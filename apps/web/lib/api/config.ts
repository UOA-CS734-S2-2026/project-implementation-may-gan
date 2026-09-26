import { Configuration } from "@dayli/api-client";

function readApiBaseUrl(): string | undefined {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!value) {
    if (process.env.NODE_ENV === "development") {
      throw new Error(
        "NEXT_PUBLIC_API_BASE_URL is required in development. Run pnpm local:auth:setup or set it in apps/web/.env.local.",
      );
    }
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an absolute HTTPS origin without a path.");
  }

  if (url.protocol !== "https:" || url.origin !== value || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be an absolute HTTPS origin without a path.");
  }

  return value;
}

/** The HTTPS Hono API origin. Browser calls include the Better Auth session cookie. */
export const apiBaseUrl = readApiBaseUrl();

export function apiConfiguration(): Configuration | undefined {
  if (!apiBaseUrl) return undefined;
  return new Configuration({ basePath: apiBaseUrl, credentials: "include" });
}

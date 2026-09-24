import { createAuthClient } from "better-auth/react";
import { apiBaseUrl } from "@/lib/api/config";

// Better Auth lives on the Hono API. The browser keeps its secure session
// cookie for that origin, so every call includes credentials.
export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  fetchOptions: { credentials: "include" },
});

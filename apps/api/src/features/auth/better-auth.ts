import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth/minimal";
import { bearer } from "better-auth/plugins/bearer";

export const authBasePath = "/api/auth";

export interface BetterAuthCompatibilityOptions {
  baseURL: string;
  secret: string;
  database: MemoryDB;
  sessionExpiresIn?: number;
}

/**
 * Creates the Better Auth configuration exercised by the Workers compatibility
 * test. The memory adapter is test-only. Production must use the PostgreSQL
 * adapter after the auth schema and migration are in place.
 */
export function createBetterAuthCompatibilitySlice({
  baseURL,
  secret,
  database,
  sessionExpiresIn,
}: BetterAuthCompatibilityOptions) {
  return betterAuth({
    baseURL,
    secret,
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    session: {
      expiresIn: sessionExpiresIn,
      disableSessionRefresh: true,
    },
    trustedOrigins: [baseURL],
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
    },
    plugins: [bearer({ requireSignature: true })],
  });
}

export type BetterAuthCompatibilitySlice = ReturnType<typeof createBetterAuthCompatibilitySlice>;

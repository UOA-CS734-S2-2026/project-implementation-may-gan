import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth/minimal";
import { bearer } from "better-auth/plugins/bearer";
import { withHyperdriveDatabase } from "../../lib/hyperdrive";
import {
  passwordResetEmail,
  sendResendAuthEmail,
  verificationEmail,
  type ResendConfiguration,
} from "./resend";

export const authBasePath = "/api/auth";

export type AuthIntegrationState = "disabled" | "configured" | "invalid";

export interface GoogleAuthConfiguration {
  clientIds: [string, string, string];
  clientSecret: string;
}

interface BetterAuthOptions {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  database: Parameters<typeof betterAuth>[0]["database"];
  google?: GoogleAuthConfiguration;
  resend?: ResendConfiguration;
  rateLimitStorage?: "database" | "memory";
  rateLimitEnabled?: boolean;
  sessionExpiresIn?: number;
}

const silentAuthLogger = { disabled: true };

function createBetterAuth(options: BetterAuthOptions) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: options.database,
    emailAndPassword: {
      enabled: true,
      // Existing imported users retain their email_verified value and can sign in.
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 15 * 60,
      ...(options.resend ? {
        async sendResetPassword({ user, url }) {
          try {
            await sendResendAuthEmail(options.resend!, passwordResetEmail(user.email, url));
          } catch {
            // Keep recovery responses generic. Do not expose or log delivery data.
          }
        },
      } : {}),
    },
    ...(options.resend ? {
      emailVerification: {
        expiresIn: 15 * 60,
        sendOnSignUp: false,
        sendOnSignIn: false,
        async sendVerificationEmail({ user, url }) {
          try {
            await sendResendAuthEmail(options.resend!, verificationEmail(user.email, url));
          } catch {
            // Keep verification responses generic. Do not expose or log delivery data.
          }
        },
      },
    } : {}),
    session: {
      expiresIn: options.sessionExpiresIn,
      disableSessionRefresh: true,
    },
    trustedOrigins: options.trustedOrigins,
    socialProviders: options.google ? {
      // The web client is first because Better Auth uses the primary ID for its
      // redirect flow. The complete list is the explicit native ID token audience allow-list.
      google: {
        clientId: options.google.clientIds,
        clientSecret: options.google.clientSecret,
        accessType: "online",
        includeGrantedScopes: false,
      },
    } : undefined,
    account: {
      // A Google subject may reuse its imported account mapping. Matching an
      // email alone never links a new Google identity to an existing account.
      // The route wrapper requires the current password for /link-social.
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        // Do not trust a provider name in place of its verified email claim.
        trustedProviders: [],
      },
    },
    rateLimit: {
      enabled: options.rateLimitEnabled ?? true,
      storage: options.rateLimitStorage ?? "database",
      customRules: {
        "/request-password-reset": { window: 60 * 60, max: 3 },
        "/send-verification-email": { window: 60 * 60, max: 3 },
        "/reset-password": { window: 60 * 60, max: 10 },
      },
    },
    advanced: {
      // Cloudflare sets this header at the edge. Do not trust forwarded IP headers from clients.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
      },
    },
    logger: silentAuthLogger,
    plugins: [bearer({ requireSignature: true })],
  });
}

export interface BetterAuthCompatibilityOptions {
  baseURL: string;
  secret: string;
  database: MemoryDB;
  google?: GoogleAuthConfiguration;
  resend?: ResendConfiguration;
  sessionExpiresIn?: number;
}

/** Test-only compatibility factory. Production uses createPostgresBetterAuth. */
export function createBetterAuthCompatibilitySlice({
  baseURL,
  secret,
  database,
  google,
  resend,
  sessionExpiresIn,
}: BetterAuthCompatibilityOptions) {
  const trustedOrigins = [baseURL];
  return {
    auth: createBetterAuth({
      baseURL,
      secret,
      database: memoryAdapter(database),
      google,
      resend,
      rateLimitStorage: "memory",
      rateLimitEnabled: false,
      sessionExpiresIn,
      trustedOrigins,
    }),
    trustedOrigins,
  };
}

export function createPostgresBetterAuth(options: BetterAuthOptions & { database: DayliDatabase }) {
  return createBetterAuth({
    ...options,
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema,
      transaction: true,
    }),
  });
}

export interface BetterAuthWorkerBindings {
  HYPERDRIVE: HyperdriveBinding;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_BASE_URL: string;
  BETTER_AUTH_TRUSTED_ORIGINS: string;
  GOOGLE_WEB_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_IOS_CLIENT_ID?: string;
  GOOGLE_ANDROID_CLIENT_ID?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

export interface BetterAuthRuntimeConfiguration {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  hyperdrive: HyperdriveBinding;
  google?: GoogleAuthConfiguration;
  resend?: ResendConfiguration;
}

export interface AuthIntegrationConfiguration {
  state: AuthIntegrationState;
  google: AuthIntegrationState;
  resend: AuthIntegrationState;
}

function parseExactHttpsOrigin(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/" && url.search === "" && url.hash === "" && url.origin === value
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

function nonBlankString(value: unknown, maximumLength: number): string | undefined {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximumLength
    ? value
    : undefined;
}

function readGoogleConfiguration(bindings: Partial<BetterAuthWorkerBindings>): { state: AuthIntegrationState; value?: GoogleAuthConfiguration } {
  const values = [
    nonBlankString(bindings.GOOGLE_WEB_CLIENT_ID, 512),
    nonBlankString(bindings.GOOGLE_IOS_CLIENT_ID, 512),
    nonBlankString(bindings.GOOGLE_ANDROID_CLIENT_ID, 512),
    nonBlankString(bindings.GOOGLE_CLIENT_SECRET, 2048),
  ] as const;
  if (values.every((value) => value === undefined)) return { state: "disabled" };
  if (values.some((value) => value === undefined)) return { state: "invalid" };
  return {
    state: "configured",
    value: { clientIds: [values[0]!, values[1]!, values[2]!], clientSecret: values[3]! },
  };
}

function readResendConfiguration(bindings: Partial<BetterAuthWorkerBindings>): { state: AuthIntegrationState; value?: ResendConfiguration } {
  const apiKey = nonBlankString(bindings.RESEND_API_KEY, 512);
  const from = nonBlankString(bindings.RESEND_FROM, 320);
  if (!apiKey && !from) return { state: "disabled" };
  if (!apiKey || !from || /[\r\n]/.test(from) || !/^.+ <[^<>\s@]+@[^<>\s@]+>$/.test(from)) return { state: "invalid" };
  return { state: "configured", value: { apiKey, from } };
}

/** Read provider state without exposing credentials to callers or logs. */
export function readAuthIntegrationConfiguration(bindings: Partial<BetterAuthWorkerBindings>): AuthIntegrationConfiguration {
  const google = readGoogleConfiguration(bindings);
  const resend = readResendConfiguration(bindings);
  const state = google.state === "invalid" || resend.state === "invalid"
    ? "invalid"
    : google.state === "disabled" && resend.state === "disabled"
      ? "disabled"
      : "configured";
  return { state, google: google.state, resend: resend.state };
}

/** Return undefined unless every deployment binding is present and safe to use. */
export function readBetterAuthRuntimeConfiguration(
  bindings: Partial<BetterAuthWorkerBindings>,
): BetterAuthRuntimeConfiguration | undefined {
  const secret = bindings.BETTER_AUTH_SECRET;
  const baseURL = parseExactHttpsOrigin(bindings.BETTER_AUTH_BASE_URL);
  const hyperdrive = bindings.HYPERDRIVE;
  const google = readGoogleConfiguration(bindings);
  const resend = readResendConfiguration(bindings);
  if (
    typeof secret !== "string" || secret.length < 32 || !baseURL || !hyperdrive?.connectionString?.trim()
    || google.state === "invalid" || resend.state === "invalid"
  ) return undefined;

  const trustedOrigins = typeof bindings.BETTER_AUTH_TRUSTED_ORIGINS === "string"
    ? bindings.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => parseExactHttpsOrigin(origin)).filter((origin): origin is string => Boolean(origin))
    : [];
  if (trustedOrigins.length === 0 || trustedOrigins.length !== new Set(trustedOrigins).size || !trustedOrigins.includes(baseURL)) {
    return undefined;
  }

  return { baseURL, secret, trustedOrigins, hyperdrive, google: google.value, resend: resend.value };
}

export async function handlePostgresBetterAuthRequest(
  request: Request,
  configuration: BetterAuthRuntimeConfiguration,
): Promise<Response> {
  return withHyperdriveDatabase(configuration.hyperdrive, async (database) => {
    const auth = createPostgresBetterAuth({
      baseURL: configuration.baseURL,
      secret: configuration.secret,
      trustedOrigins: configuration.trustedOrigins,
      database,
      google: configuration.google,
      resend: configuration.resend,
    });
    return auth.handler(request);
  });
}

export type BetterAuthCompatibilitySlice = ReturnType<typeof createBetterAuthCompatibilitySlice>;

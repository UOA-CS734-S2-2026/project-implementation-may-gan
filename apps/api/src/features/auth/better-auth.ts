import { schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth/minimal";
import { APIError } from "better-auth/api";
import { bearer } from "better-auth/plugins/bearer";
import { decodeJwt, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { createMemorySocialLinkConfirmationStore } from "./social-link-confirmation";
import { withHyperdriveDatabase } from "../../infrastructure/database/hyperdrive";
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
const usernamePattern = /^[a-z0-9][a-z0-9_]{2,29}$/;

async function verifyGoogleBrowserIdToken(token: string, audience: readonly string[]) {
  try {
    const { alg, kid } = decodeProtectedHeader(token);
    if (alg !== "RS256" || !kid) return null;
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    const body = await response.json() as { keys?: JWK[] };
    const jwks = body.keys?.filter((key) => key.kid === kid) ?? [];
    for (const jwk of jwks) {
      try {
        const publicKey = await importJWK(jwk, "RS256");
        const { payload } = await jwtVerify(token, publicKey, {
          algorithms: ["RS256"],
          issuer: ["https://accounts.google.com", "accounts.google.com"],
          audience: [...audience],
          maxTokenAge: "1h",
        });
        return payload;
      } catch {
        // A key rotation response may contain several candidates. Try each.
      }
    }
  } catch {
    // OAuth responses remain generic. Do not reflect or log provider tokens.
  }
  return null;
}

function createBetterAuth(options: BetterAuthOptions) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: options.database,
    user: {
      additionalFields: {
        // This is accepted only while a user is created. The database trigger
        // serializes case-folded claims so concurrent registrations cannot win
        // the same public handle.
        username: { type: "string", required: false },
        // The public name is deliberately separate from Better Auth's name.
        // OAuth providers can populate name, but never this explicit field.
        displayUsername: { type: "string", required: false },
        // This is an insertion-only, server-populated bridge into the actual
        // Better Auth adapter transaction. Clients can neither send nor read it.
        legal_registration_admission: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, hookContext) => {
            const username = typeof user.username === "string" ? user.username.trim().toLowerCase() : undefined;
            // Only password registration supplies a public identity. Social
            // sign-in intentionally creates a setup-pending account instead.
            const path = (hookContext as { path?: unknown } | null)?.path;
            if (path === "/sign-up/email" && username === undefined) {
              throw new APIError("BAD_REQUEST", { message: "Username is required." });
            }
            if (username !== undefined && !usernamePattern.test(username)) {
              throw new APIError("BAD_REQUEST", { message: "Username must be 3-30 lowercase letters, numbers, or underscores." });
            }
            const displayUsername = typeof user.displayUsername === "string" ? user.displayUsername.trim() : undefined;
            if (displayUsername !== undefined && displayUsername.length > 80) {
              throw new APIError("BAD_REQUEST", { message: "Public name is too long." });
            }
            const context = hookContext as {
              getHeader?: (name: string) => string | null;
              request?: Request;
              body?: { additionalData?: Record<string, unknown> };
            } | null;
            const header = (name: string) => context?.getHeader?.(name) ?? context?.request?.headers.get(name) ?? null;
            const additionalData = context?.body?.additionalData;
            const intent = header("x-dayli-registration-intent") ?? (typeof additionalData?.dayliRegistrationIntent === "string" ? additionalData.dayliRegistrationIntent : null);
            const binding = header("x-dayli-registration-binding") ?? (typeof additionalData?.dayliRegistrationBinding === "string" ? additionalData.dayliRegistrationBinding : null);
            const browserState = header("x-dayli-registration-browser-state");
            // The hook runs immediately before the adapter's real user INSERT.
            // It overwrites all user-controlled values with material from the
            // request wrapper. The database trigger validates and consumes it.
            const legal_registration_admission = browserState
              ? `google_browser||${browserState}`
              : intent && binding
                ? `${path === "/sign-up/email" ? "email" : "google_native"}|${intent}|${binding}`
                : undefined;
            return { data: { ...user, username, displayUsername: displayUsername || null, legal_registration_admission } };
          },
        },
        update: {
          before: async (data, hookContext) => {
            const path = (hookContext as { path?: unknown } | null)?.path;
            if (path === "/update-user" && ("username" in data || "displayUsername" in data)) {
              throw new APIError("FORBIDDEN", { message: "Username and public name changes are not available." });
            }
            return { data };
          },
        },
      },
    },
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
        // Better Auth's default browser-code profile mapper decodes the token
        // endpoint ID token. Verify it with Google's JWKS before it can name a
        // user, matching the native ID-token boundary.
        async getUserInfo(tokens) {
          if (!tokens.idToken) return null;
          // Better Auth verifies direct native ID-token sign-ins before this
          // mapper. Browser code exchange supplies an access token and must
          // verify its returned ID token before mapping a user.
          const profile = tokens.accessToken
            ? await verifyGoogleBrowserIdToken(tokens.idToken, options.google!.clientIds)
            : decodeJwt(tokens.idToken);
          if (!profile || typeof profile.sub !== "string" || typeof profile.email !== "string" || typeof profile.email_verified !== "boolean") return null;
          return {
            user: {
              name: typeof profile.name === "string" ? profile.name : "",
              email: profile.email,
              image: typeof profile.picture === "string" ? profile.picture : undefined,
              emailVerified: profile.email_verified,
            },
            // The verified JWT is structurally the provider profile Better Auth
            // persists alongside the account. Claims used above are checked.
            data: profile as never,
          };
        },
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
    socialLinkConfirmations: createMemorySocialLinkConfirmationStore(),
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

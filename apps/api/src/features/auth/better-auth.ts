import { createHyperdriveDatabase, schema, type DayliDatabase, type HyperdriveBinding } from "@dayli/db";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth/minimal";
import { bearer } from "better-auth/plugins/bearer";

export const authBasePath = "/api/auth";

interface BetterAuthOptions {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  sessionExpiresIn?: number;
}

function createBetterAuth(options: BetterAuthOptions & { database: Parameters<typeof betterAuth>[0]["database"] }) {
  return betterAuth({
    baseURL: options.baseURL,
    secret: options.secret,
    database: options.database,
    emailAndPassword: { enabled: true },
    session: {
      expiresIn: options.sessionExpiresIn,
      disableSessionRefresh: true,
    },
    trustedOrigins: options.trustedOrigins,
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

export interface BetterAuthCompatibilityOptions {
  baseURL: string;
  secret: string;
  database: MemoryDB;
  sessionExpiresIn?: number;
}

/** Test-only compatibility factory. Production uses createPostgresBetterAuth. */
export function createBetterAuthCompatibilitySlice({
  baseURL,
  secret,
  database,
  sessionExpiresIn,
}: BetterAuthCompatibilityOptions) {
  const trustedOrigins = [baseURL];
  return {
    auth: createBetterAuth({
      baseURL,
      secret,
      database: memoryAdapter(database),
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
}

export interface BetterAuthRuntimeConfiguration extends BetterAuthOptions {
  hyperdrive: HyperdriveBinding;
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

/** Return undefined unless every deployment binding is present and safe to use. */
export function readBetterAuthRuntimeConfiguration(
  bindings: Partial<BetterAuthWorkerBindings>,
): BetterAuthRuntimeConfiguration | undefined {
  const secret = bindings.BETTER_AUTH_SECRET;
  const baseURL = parseExactHttpsOrigin(bindings.BETTER_AUTH_BASE_URL);
  const hyperdrive = bindings.HYPERDRIVE;
  if (typeof secret !== "string" || secret.length < 32 || !baseURL || !hyperdrive?.connectionString?.trim()) {
    return undefined;
  }

  const trustedOrigins = typeof bindings.BETTER_AUTH_TRUSTED_ORIGINS === "string"
    ? bindings.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((origin) => parseExactHttpsOrigin(origin)).filter((origin): origin is string => Boolean(origin))
    : [];
  if (trustedOrigins.length === 0 || trustedOrigins.length !== new Set(trustedOrigins).size || !trustedOrigins.includes(baseURL)) {
    return undefined;
  }

  return { baseURL, secret, trustedOrigins, hyperdrive };
}

export type HyperdriveDatabaseFactory = typeof createHyperdriveDatabase;

/**
 * Bounds every Hyperdrive client to one completed operation. Better Auth completes
 * its database work before its handler resolves, so closing here cannot consume a
 * response body or leave a client alive in a Worker isolate.
 */
export async function withHyperdriveDatabase<T>(
  hyperdrive: HyperdriveBinding,
  operation: (database: DayliDatabase) => Promise<T>,
  createDatabase: HyperdriveDatabaseFactory = createHyperdriveDatabase,
): Promise<T> {
  const database = createDatabase(hyperdrive);
  try {
    return await operation(database.db);
  } finally {
    await database.close();
  }
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
    });
    return auth.handler(request);
  });
}

export type BetterAuthCompatibilitySlice = ReturnType<typeof createBetterAuthCompatibilitySlice>;

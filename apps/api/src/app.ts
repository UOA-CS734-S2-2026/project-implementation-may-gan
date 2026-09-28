import { OpenAPIHono } from "@hono/zod-openapi";
import {
  registerBetterAuthCompatibilityRoutes,
  registerPostgresBetterAuthRoutes,
} from "./features/auth/route";
import {
  createPostgresBetterAuth,
  readBetterAuthRuntimeConfiguration,
  type BetterAuthCompatibilitySlice,
} from "./features/auth/better-auth";
import { withHyperdriveDatabase } from "./lib/hyperdrive";
import type { ApiEnv } from "./env";
import {
  createHyperdriveMediaReservationRuntime,
  registerMediaReservationRoutes,
  type MediaReservationRuntime,
} from "./features/media/reserve-upload/reserve-upload.route";
import { registerMediaCompleteRoute } from "./features/media/complete/route";
import {
  registerRelationshipsRoutes,
  type RelationshipsRouteDependencies,
} from "./features/relationships/route";
import { createHyperdriveRelationshipsStore } from "./features/relationships/postgres-store";
import { createRelationshipsService } from "./features/relationships/service";
import {
  registerCurrentPostingDayRoute,
  type CurrentPostingDayRouteDependencies,
} from "./features/posting-days/get-current-posting-day/get-current-posting-day.route";
import { createCurrentPostingDayService } from "./features/posting-days/get-current-posting-day/get-current-posting-day.service";
import { createDailyPromptRepository, hasPostedOnDay } from "./features/posting-days/get-current-posting-day/get-current-posting-day.repository";
import { createAucklandDayService } from "@dayli/domain";
import {
  registerCreateDailyPostRoute,
  type CreateDailyPostRouteDependencies,
} from "./features/posts/create-post/create-post.route";
import { createDailyPostService } from "./features/posts/create-post/create-post.service";
import { createHyperdriveDailyPostStore } from "./features/posts/create-post/create-post.repository";
import { registerApiDocsRoute } from "./features/system/get-api-docs/get-api-docs.route";
import { registerHealthRoute } from "./features/system/get-health/get-health.route";
import { registerTestContractsRoute } from "./features/system/test-contracts/route";
import { readR2RuntimeConfiguration } from "./lib/r2";
import { registerApplicationCors } from "./lib/cors";
import type { AuthenticatedActor, AuthenticatedApiEnv } from "./http/authenticated-actor";

export interface AppDependencies {
  auth?: BetterAuthCompatibilitySlice;
  media?: MediaReservationRuntime;
  postingDay?: CurrentPostingDayRouteDependencies;
  posts?: CreateDailyPostRouteDependencies;
  relationships?: RelationshipsRouteDependencies;
  /** Exact browser origins allowed to call /api/v1 with credentials. */
  trustedOrigins?: readonly string[];
}

export function createApp({
  auth,
  media,
  postingDay,
  posts,
  relationships = unavailableRelationships,
  trustedOrigins = [],
}: AppDependencies = {}) {
  const api = new OpenAPIHono<AuthenticatedApiEnv>({
    defaultHook: (result, context) => {
      if (!result.success) {
        return context.json(
          {
            error: {
              code: "VALIDATION_FAILED" as const,
              message: "The request contains invalid values.",
              requestId: crypto.randomUUID(),
              details: { issues: result.error.issues },
            },
          },
          422,
        );
      }
    },
  });

  // Middleware must precede the routes it wraps.
  if (trustedOrigins.length > 0) registerApplicationCors(api, trustedOrigins);
  if (auth) registerBetterAuthCompatibilityRoutes(api, auth);

  api.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Dayli session token",
  });
  api.openAPIRegistry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "better-auth.session_token",
    description: "Browser clients may authenticate with the Better Auth secure session cookie.",
  });
  registerHealthRoute(api);
  registerTestContractsRoute(api);
  registerMediaReservationRoutes(api, media);
  registerMediaCompleteRoute(api, media);
  registerApiDocsRoute(api);
  registerCurrentPostingDayRoute(api, postingDay ?? { resolveSession: async () => null });
  registerCreateDailyPostRoute(api, posts ?? { resolveSession: async () => null });
  registerRelationshipsRoutes(api, relationships);

  api.doc("/api/v1/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "Dayli API",
      version: "1.0.0",
      description: "REST API shared by the Dayli mobile and web clients.",
    },
  });

  return api;
}

/** Build a Worker request app with all configured database-backed feature runtimes. */
export function createAppForEnv(env: ApiEnv) {
  const configuration = readBetterAuthRuntimeConfiguration(env);
  const r2Runtime = readR2RuntimeConfiguration(env);
  const media = configuration && r2Runtime
    ? createHyperdriveMediaReservationRuntime(
        configuration.hyperdrive,
        { baseURL: configuration.baseURL, secret: configuration.secret, trustedOrigins: configuration.trustedOrigins },
        r2Runtime,
      )
    : undefined;
  const postingDay = configuration ? createPostingDayDependencies(configuration) : undefined;
  const posts = configuration ? createDailyPostDependencies(configuration) : undefined;
  const relationships = configuration ? {
    service: createRelationshipsService(createHyperdriveRelationshipsStore(configuration.hyperdrive)),
    resolveSession: (request: Request) => withHyperdriveDatabase(configuration.hyperdrive, async (database) => {
      const auth = createPostgresBetterAuth({
        baseURL: configuration.baseURL,
        secret: configuration.secret,
        trustedOrigins: configuration.trustedOrigins,
        database,
        google: configuration.google,
        resend: configuration.resend,
      });
      const session = await auth.api.getSession({ headers: request.headers });
      return session?.user?.id ? { userId: session.user.id } satisfies AuthenticatedActor : null;
    }),
  } satisfies RelationshipsRouteDependencies : undefined;
  const api = createApp({
    postingDay,
    posts,
    media,
    relationships,
    trustedOrigins: configuration?.trustedOrigins,
  });
  if (!configuration) return api;
  registerPostgresBetterAuthRoutes(api, env);
  return api;
}

const unavailableRelationships: RelationshipsRouteDependencies = {
  service: {
    getStatus: async () => { throw new Error("Relationship storage is unavailable."); },
    listPendingRequests: async () => { throw new Error("Relationship storage is unavailable."); },
    sendRequest: async () => { throw new Error("Relationship storage is unavailable."); },
    acceptRequest: async () => { throw new Error("Relationship storage is unavailable."); },
    declineRequest: async () => { throw new Error("Relationship storage is unavailable."); },
    cancelRequest: async () => { throw new Error("Relationship storage is unavailable."); },
    removeFriendship: async () => { throw new Error("Relationship storage is unavailable."); },
    block: async () => { throw new Error("Relationship storage is unavailable."); },
    unblock: async () => { throw new Error("Relationship storage is unavailable."); },
  },
  resolveSession: async () => null,
};

function createPostingDayDependencies(
  configuration: NonNullable<ReturnType<typeof readBetterAuthRuntimeConfiguration>>,
): CurrentPostingDayRouteDependencies {
  const clock = { now: () => new Date() };
  const dayService = createAucklandDayService(clock);

  return {
    resolveSession: createSessionResolver(configuration),
    service: createCurrentPostingDayService({
      clock,
      dayService,
      prompts: {
        findActivePrompt: (monthDay, localDate) => withHyperdriveDatabase(configuration.hyperdrive, (database) => (
          createDailyPromptRepository(database).findActivePrompt(monthDay, localDate)
        )),
      },
      hasPosted: (userId, localDate) => withHyperdriveDatabase(configuration.hyperdrive, (database) => (
        hasPostedOnDay(database, userId, localDate)
      )),
      onOperationalAlert: (alert) => console.error("dayli posting-day operational alert", alert),
    }),
  };
}

type RuntimeConfiguration = NonNullable<ReturnType<typeof readBetterAuthRuntimeConfiguration>>;

/** Resolve the Better Auth cookie or bearer session to a user ID. */
function createSessionResolver(configuration: RuntimeConfiguration) {
  return (request: Request): Promise<AuthenticatedActor | null> => withHyperdriveDatabase(configuration.hyperdrive, async (database) => {
    const auth = createPostgresBetterAuth({
      baseURL: configuration.baseURL,
      secret: configuration.secret,
      trustedOrigins: configuration.trustedOrigins,
      database,
      google: configuration.google,
      resend: configuration.resend,
    });
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user?.id ? { userId: session.user.id } : null;
  });
}

function createDailyPostDependencies(configuration: RuntimeConfiguration): CreateDailyPostRouteDependencies {
  const clock = { now: () => new Date() };
  return {
    resolveSession: createSessionResolver(configuration),
    service: createDailyPostService({
      store: createHyperdriveDailyPostStore(configuration.hyperdrive),
      clock,
      dayService: createAucklandDayService(clock),
    }),
  };
}

/** The default app is intentionally database and auth free for local route work. */
export const app = createApp();

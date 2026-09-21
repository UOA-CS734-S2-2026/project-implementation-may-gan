import { OpenAPIHono } from "@hono/zod-openapi";
import {
  registerBetterAuthCompatibilityRoutes,
  registerPostgresBetterAuthRoutes,
} from "./features/auth/route";
import {
  createPostgresBetterAuth,
  readBetterAuthRuntimeConfiguration,
  withHyperdriveDatabase,
  type BetterAuthCompatibilitySlice,
} from "./features/auth/better-auth";
import type { ApiEnv } from "./env";
import {
  registerRelationshipsRoutes,
  type RelationshipsRouteDependencies,
} from "./features/relationships/route";
import { createHyperdriveRelationshipsStore } from "./features/relationships/postgres-store";
import { createRelationshipsService } from "./features/relationships/service";
import { registerApiDocsRoute } from "./features/system/api-docs/route";
import { registerHealthRoute } from "./features/system/health/route";
import { registerTestContractsRoute } from "./features/system/test-contracts/route";
import {
  registerCurrentPostingDayRoute,
  type CurrentPostingDayRouteDependencies,
} from "./features/posting-days/current/route";
import {
  createCurrentPostingDayService,
} from "./features/posting-days/current/service";
import { createDailyPromptRepository, hasPostedOnDay } from "./features/posting-days/current/repository";
import { createAucklandDayService } from "@dayli/domain";

export function createApp(
  auth?: BetterAuthCompatibilitySlice,
  postingDay?: CurrentPostingDayRouteDependencies,
  relationships: RelationshipsRouteDependencies = unavailableRelationships,
) {
  const api = new OpenAPIHono({
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

  if (auth) {
    registerBetterAuthCompatibilityRoutes(api, auth);
  }

  api.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "Dayli session token",
  });

  registerHealthRoute(api);
  registerTestContractsRoute(api);
  registerApiDocsRoute(api);
  registerCurrentPostingDayRoute(api, postingDay ?? {
    authenticate: async () => null,
  });
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

/** Build a Worker request app. Auth remains absent until validated bindings exist. */
export function createAppForEnv(env: ApiEnv) {
  const configuration = readBetterAuthRuntimeConfiguration(env);
  const postingDay = configuration ? createPostingDayDependencies(configuration) : undefined;
  const relationships = configuration ? {
    service: createRelationshipsService(createHyperdriveRelationshipsStore(configuration.hyperdrive)),
    resolveSession: (request) => withHyperdriveDatabase(configuration.hyperdrive, async (database) => {
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
    }),
  } satisfies RelationshipsRouteDependencies : undefined;
  const api = createApp(undefined, postingDay, relationships);
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
    authenticate: (request) => withHyperdriveDatabase(configuration.hyperdrive, async (database) => {
      const auth = createPostgresBetterAuth({
        baseURL: configuration.baseURL,
        secret: configuration.secret,
        trustedOrigins: configuration.trustedOrigins,
        database,
        google: configuration.google,
        resend: configuration.resend,
      });
      const session = await auth.api.getSession({ headers: request.headers });
      return session?.user?.id ?? null;
    }),
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
      onOperationalAlert: (alert) => {
        console.error("dayli posting-day operational alert", alert);
      },
    }),
  };
}

/** The default app is intentionally database and auth free for local route work. */
export const app = createApp();

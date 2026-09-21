import { OpenAPIHono } from "@hono/zod-openapi";
import { registerBetterAuthCompatibilityRoutes, registerPostgresBetterAuthRoutes } from "./features/auth/route";
import { createPostgresBetterAuth, readBetterAuthRuntimeConfiguration, type BetterAuthCompatibilitySlice } from "./features/auth/better-auth";
import { withHyperdriveDatabase } from "./lib/hyperdrive";
import type { ApiEnv } from "./env";
import { registerApiDocsRoute } from "./features/system/api-docs/route";
import { registerHealthRoute } from "./features/system/health/route";
import { registerTestContractsRoute } from "./features/system/test-contracts/route";
import { createHyperdriveMediaReservationRuntime, registerMediaReservationRoutes, type MediaReservationRuntime } from "./features/media/reserve/route";
import { readR2RuntimeConfiguration } from "./lib/r2";
import { registerCurrentPostingDayRoute, type CurrentPostingDayRouteDependencies } from "./features/posting-days/current/route";
import { createCurrentPostingDayService } from "./features/posting-days/current/service";
import { createDailyPromptRepository, hasPostedOnDay } from "./features/posting-days/current/repository";
import { createAucklandDayService } from "@dayli/domain";

type SecondaryDependencies = MediaReservationRuntime | CurrentPostingDayRouteDependencies;

export function createApp(auth?: BetterAuthCompatibilitySlice, secondary?: SecondaryDependencies, mediaOverride?: MediaReservationRuntime) {
  const media = mediaOverride ?? (secondary && "withRequestContext" in secondary ? secondary : undefined);
  const postingDay = secondary && "authenticate" in secondary ? secondary : undefined;
  const api = new OpenAPIHono({
    defaultHook: (result, context) => {
      if (!result.success) return context.json({ error: { code: "VALIDATION_FAILED" as const, message: "The request contains invalid values.", requestId: crypto.randomUUID(), details: { issues: result.error.issues } } }, 422);
    },
  });
  if (auth) registerBetterAuthCompatibilityRoutes(api, auth);
  registerHealthRoute(api);
  registerTestContractsRoute(api);
  registerMediaReservationRoutes(api, media);
  registerApiDocsRoute(api);
  registerCurrentPostingDayRoute(api, postingDay ?? { authenticate: async () => null });
  api.doc("/api/v1/openapi.json", { openapi: "3.1.0", info: { title: "Dayli API", version: "1.0.0", description: "REST API shared by the Dayli mobile and web clients." } });
  return api;
}

export function createAppForEnv(env: ApiEnv) {
  const configuration = readBetterAuthRuntimeConfiguration(env);
  const r2Runtime = readR2RuntimeConfiguration(env);
  const media = configuration && r2Runtime ? createHyperdriveMediaReservationRuntime(configuration.hyperdrive, { baseURL: configuration.baseURL, secret: configuration.secret, trustedOrigins: configuration.trustedOrigins }, r2Runtime) : undefined;
  const postingDay = configuration ? createPostingDayDependencies(configuration) : undefined;
  const api = createApp(undefined, postingDay, media);
  if (!configuration) return api;
  registerPostgresBetterAuthRoutes(api, env);
  return api;
}

function createPostingDayDependencies(configuration: NonNullable<ReturnType<typeof readBetterAuthRuntimeConfiguration>>): CurrentPostingDayRouteDependencies {
  const clock = { now: () => new Date() };
  const dayService = createAucklandDayService(clock);
  return {
    authenticate: (request) => withHyperdriveDatabase(configuration.hyperdrive, async (database) => {
      const auth = createPostgresBetterAuth({ baseURL: configuration.baseURL, secret: configuration.secret, trustedOrigins: configuration.trustedOrigins, database, google: configuration.google, resend: configuration.resend });
      const session = await auth.api.getSession({ headers: request.headers });
      return session?.user?.id ?? null;
    }),
    service: createCurrentPostingDayService({
      clock,
      dayService,
      prompts: { findActivePrompt: (monthDay, localDate) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createDailyPromptRepository(database).findActivePrompt(monthDay, localDate)) },
      hasPosted: (userId, localDate) => withHyperdriveDatabase(configuration.hyperdrive, (database) => hasPostedOnDay(database, userId, localDate)),
      onOperationalAlert: (alert) => console.error("dayli posting-day operational alert", alert),
    }),
  };
}

export const app = createApp();

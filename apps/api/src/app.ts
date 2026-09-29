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
import { withHyperdriveDatabase } from "./infrastructure/database/hyperdrive";
import type { ApiEnv } from "./env";
import {
  createHyperdriveMediaReservationRuntime,
  registerMediaReservationRoutes,
  type MediaReservationRouteDependencies,
} from "./features/media/media.routes";
import { registerMediaCompleteRoute } from "./features/media/complete/route";
import {
  registerRelationshipsRoutes,
  type RelationshipsRouteDependencies,
} from "./features/relationships/relationships.routes";
import { createHyperdriveRelationshipsStore } from "./features/relationships/relationships.repository";
import { createRelationshipsService } from "./features/relationships/relationships.service";
import {
  registerCurrentPostingDayRoute,
  type CurrentPostingDayRouteDependencies,
} from "./features/posting-days/get-current-posting-day/get-current-posting-day.route";
import { createCurrentPostingDayService } from "./features/posting-days/get-current-posting-day/get-current-posting-day.service";
import { createDailyPromptRepository, hasPostedOnDay } from "./features/posting-days/get-current-posting-day/get-current-posting-day.repository";
import { createAucklandDayService } from "@dayli/domain";
import { sql } from "@dayli/db";
import {
  registerCreateDailyPostRoute,
  type CreateDailyPostRouteDependencies,
} from "./features/posts/create-post/create-post.route";
import { createDailyPostService } from "./features/posts/create-post/create-post.service";
import { createHyperdriveDailyPostStore } from "./features/posts/create-post/create-post.repository";
import { registerApiDocsRoute } from "./features/system/get-api-docs/get-api-docs.route";
import { registerHealthRoute } from "./features/system/get-health/get-health.route";
import { registerTestContractsRoute } from "./features/system/test-contracts/route";
import { readR2RuntimeConfiguration } from "./infrastructure/media/r2";
import { registerApplicationCors } from "./http/middleware/cors";
import type { AuthenticatedActor, AuthenticatedApiEnv } from "./http/authenticated-actor";
import { registerMessagingRoutes, type MessagingRouteDependencies } from "./features/messaging/messaging.routes";
import { createSendMessageService } from "./features/messaging/messages/send-message/send-message.service";
import { createHyperdriveMessageWriteStore } from "./features/messaging/messages/send-message/send-message.repository";
import { createEditMessageService } from "./features/messaging/messages/edit-message/edit-message.service";
import { createUnsendMessageService } from "./features/messaging/messages/unsend-message/unsend-message.service";
import { createSetReactionService } from "./features/messaging/messages/set-reaction/set-reaction.service";
import { createRemoveReactionService } from "./features/messaging/messages/remove-reaction/remove-reaction.service";
import { createCreateDirectConversationService } from "./features/messaging/conversations/create-direct-conversation/create-direct-conversation.service";
import { createHyperdriveConversationReader, createHyperdriveDirectConversationStore } from "./features/messaging/conversations/conversation.repository";
import { registerRealtimeTicketRoute, type RealtimeTicketRouteDependencies } from "./features/messaging/realtime/ticket.route";
import { createPostgresRealtimeTicketStore } from "./features/messaging/realtime/ticket.repository";
import { createRealtimeTicketService, type VerifiedRealtimeSession } from "./features/messaging/realtime/ticket.service";
import { registerRealtimeConnectRoute, type RealtimeConnectRouteDependencies } from "./features/messaging/realtime/connect.route";
import { registerPushDeviceRoutes, type PushDeviceRouteDependencies } from "./features/messaging/push/push-device.route";
import { createPostgresPushDeviceStore } from "./features/messaging/push/push-device.repository";
import { createPushDeviceService } from "./features/messaging/push/push-device.service";
import { createDeferredWorkerPushTokenProtector, hasWorkerPushTokenProtection } from "./infrastructure/push/token-encryption";
import { createMessagingDeliveryDispatcher } from "./infrastructure/jobs/messaging-delivery-runtime";
import { createDurableObjectRealtimePublisher } from "./infrastructure/realtime/publisher";
import { registerUsernameProfileRoutes, type UsernameProfileRouteDependencies } from "./features/profiles/username/username.route";
import { createPostgresUsernameProfileStore } from "./features/profiles/username/username.repository";

export interface AppDependencies {
  auth?: BetterAuthCompatibilitySlice;
  media?: MediaReservationRouteDependencies;
  postingDay?: CurrentPostingDayRouteDependencies;
  posts?: CreateDailyPostRouteDependencies;
  relationships?: RelationshipsRouteDependencies;
  messaging?: MessagingRouteDependencies;
  realtimeTicket?: RealtimeTicketRouteDependencies;
  realtimeConnect?: RealtimeConnectRouteDependencies;
  pushDevices?: PushDeviceRouteDependencies;
  usernameProfile?: UsernameProfileRouteDependencies;
  /** Exact browser origins allowed to call /api/v1 with credentials. */
  trustedOrigins?: readonly string[];
}

export function createApp({
  auth,
  media,
  postingDay,
  posts,
  relationships = unavailableRelationships,
  messaging = unavailableMessaging,
  realtimeTicket = unavailableRealtimeTicket,
  realtimeConnect = {},
  pushDevices = unavailablePushDevices,
  usernameProfile = unavailableUsernameProfile,
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
  registerMessagingRoutes(api, messaging);
  registerRealtimeTicketRoute(api, realtimeTicket);
  registerPushDeviceRoutes(api, pushDevices);
  registerUsernameProfileRoutes(api, usernameProfile);
  registerRealtimeConnectRoute(api, realtimeConnect);

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
    ? {
        runtime: createHyperdriveMediaReservationRuntime(configuration.hyperdrive, r2Runtime),
        resolveSession: createSessionResolver(configuration),
      } satisfies MediaReservationRouteDependencies
    : undefined;
  const postingDay = configuration ? createPostingDayDependencies(configuration) : undefined;
  const posts = configuration ? createDailyPostDependencies(configuration) : undefined;
  const hasUsername = configuration ? createUsernameChecker(configuration) : undefined;
  const messaging = configuration ? createMessagingDependencies(configuration, env, hasUsername!) : undefined;
  const realtime = configuration && env.USER_REALTIME ? createRealtimeDependencies(configuration, env, hasUsername!) : undefined;
  const pushDevices = configuration ? createPushDeviceDependencies(configuration, env, hasUsername!) : undefined;
  const usernameProfile = configuration ? {
    resolveSession: createSessionResolver(configuration),
    store: withHyperdriveUsernameProfileStore(configuration),
  } satisfies UsernameProfileRouteDependencies : undefined;
  const relationships = configuration ? {
    service: createRelationshipsService(createHyperdriveRelationshipsStore(configuration.hyperdrive)),
    hasUsername,
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
    messaging,
    realtimeTicket: realtime?.ticket,
    realtimeConnect: realtime?.connect,
    pushDevices,
    usernameProfile,
    trustedOrigins: configuration?.trustedOrigins,
  });
  if (!configuration) return api;
  registerPostgresBetterAuthRoutes(api, env, env.USER_REALTIME ? {
    revokeSessions: async (userId, sessionIds) => {
      const publisher = createDurableObjectRealtimePublisher(env.USER_REALTIME!, configuration.hyperdrive);
      await Promise.allSettled(sessionIds.map((sessionId) => publisher.revokeSession(userId, sessionId)));
    },
  } : undefined);
  return api;
}

const unavailableUsernameProfile: UsernameProfileRouteDependencies = { resolveSession: async () => null };
const unavailableMessaging: MessagingRouteDependencies = { resolveSession: async () => null };
const unavailableRealtimeTicket: RealtimeTicketRouteDependencies = {
  resolveSession: async () => null,
  resolveRealtimeSession: async () => null,
  webSocketUrl: "wss://realtime.invalid/api/v1/realtime/connect",
};
const unavailablePushDevices: PushDeviceRouteDependencies = { resolveSession: async () => null, resolvePushSession: async () => null };

const unavailableRelationships: RelationshipsRouteDependencies = {  service: {
    getStatus: async () => { throw new Error("Relationship storage is unavailable."); },
    listPendingRequests: async () => { throw new Error("Relationship storage is unavailable."); },
    listFriends: async () => { throw new Error("Relationship storage is unavailable."); },
    searchUsers: async () => { throw new Error("Relationship storage is unavailable."); },
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

function withHyperdriveUsernameProfileStore(configuration: NonNullable<ReturnType<typeof readBetterAuthRuntimeConfiguration>>) {
  return {
    get: (userId: string) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createPostgresUsernameProfileStore(database).get(userId)),
    claimInitial: (userId: string, input: import("./features/profiles/username/username.contract").UsernameSetupInput) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createPostgresUsernameProfileStore(database).claimInitial(userId, input)),
  };
}

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

function createVerifiedRealtimeSessionResolver(configuration: RuntimeConfiguration) {
  return async (request: Request): Promise<VerifiedRealtimeSession | null> => withHyperdriveDatabase(configuration.hyperdrive, async (database) => {
    const auth = createPostgresBetterAuth({ baseURL: configuration.baseURL, secret: configuration.secret, trustedOrigins: configuration.trustedOrigins, database, google: configuration.google, resend: configuration.resend });
    const current = await auth.api.getSession({ headers: request.headers }) as { user?: { id?: string }; session?: { id?: string; expiresAt?: string | Date } } | null;
    const userId = current?.user?.id;
    const sessionId = current?.session?.id;
    const expiresAt = current?.session?.expiresAt ? new Date(current.session.expiresAt) : null;
    return userId && sessionId && expiresAt && Number.isFinite(expiresAt.getTime()) ? { userId, sessionId, expiresAt } : null;
  });
}

function resolveRealtimeSessionById(configuration: RuntimeConfiguration, sessionId: string): Promise<VerifiedRealtimeSession | null> {
  return withHyperdriveDatabase(configuration.hyperdrive, async (database) => {
    const result = await database.execute(sql`select id, user_id, expires_at from public.session where id = ${sessionId} and expires_at > now() limit 1`);
    const [row] = [...result as Iterable<{ id: unknown; user_id: unknown; expires_at: unknown }>];
    return row ? { sessionId: String(row.id), userId: String(row.user_id), expiresAt: new Date(String(row.expires_at)) } : null;
  });
}

function createUsernameChecker(configuration: RuntimeConfiguration) {
  return async (userId: string) => (await withHyperdriveUsernameProfileStore(configuration).get(userId))?.needsUsernameSetup === false;
}

function createMessagingDependencies(
  configuration: RuntimeConfiguration,
  env: ApiEnv,
  hasUsername: NonNullable<ReturnType<typeof createUsernameChecker>>,
): MessagingRouteDependencies {
  const store = createHyperdriveMessageWriteStore(configuration.hyperdrive);
  const userRealtime = env.USER_REALTIME;
  return {
    resolveSession: createSessionResolver(configuration),
    hasUsername,
    service: createSendMessageService({ store }),
    edit: createEditMessageService({ store }),
    unsend: createUnsendMessageService({ store }),
    setReaction: createSetReactionService({ store }),
    removeReaction: createRemoveReactionService({ store }),
    direct: createCreateDirectConversationService({ store: createHyperdriveDirectConversationStore(configuration.hyperdrive) }),
    reader: createHyperdriveConversationReader(configuration.hyperdrive),
    dispatchImmediately: userRealtime ? () => createMessagingDeliveryDispatcher({ ...env, USER_REALTIME: userRealtime }).dispatchImmediately() : undefined,
  };
}

function createRealtimeDependencies(
  configuration: RuntimeConfiguration,
  env: ApiEnv,
  hasUsername: NonNullable<ReturnType<typeof createUsernameChecker>>,
): { ticket: RealtimeTicketRouteDependencies; connect: RealtimeConnectRouteDependencies } {
  const resolveRealtimeSession = createVerifiedRealtimeSessionResolver(configuration);
  const tickets = {
    issue: async (session: VerifiedRealtimeSession) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createRealtimeTicketService({ store: createPostgresRealtimeTicketStore(database) }).issue(session)),
    consume: async (ticket: string) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createRealtimeTicketService({ store: createPostgresRealtimeTicketStore(database) }).consume(ticket)),
  };
  const webSocketUrl = new URL("/api/v1/realtime/connect", configuration.baseURL);
  webSocketUrl.protocol = webSocketUrl.protocol === "https:" ? "wss:" : "ws:";
  const connect: RealtimeConnectRouteDependencies = {
    tickets,
    resolveActiveSession: async (sessionId) => resolveRealtimeSessionById(configuration, sessionId),
    userRealtime: env.USER_REALTIME!,
    trustedOrigins: configuration.trustedOrigins,
    hasUsername,
  };
  return { ticket: { resolveSession: createSessionResolver(configuration), resolveRealtimeSession, tickets, webSocketUrl: webSocketUrl.toString(), hasUsername }, connect };
}

function createPushDeviceDependencies(
  configuration: RuntimeConfiguration,
  env: ApiEnv,
  hasUsername: NonNullable<ReturnType<typeof createUsernameChecker>>,
): PushDeviceRouteDependencies {
  const resolvePushSession = createVerifiedRealtimeSessionResolver(configuration);
  if (!hasWorkerPushTokenProtection(env.PUSH_TOKEN_ENCRYPTION_KEY)) return { resolveSession: createSessionResolver(configuration), resolvePushSession, hasUsername };
  return {
    resolveSession: createSessionResolver(configuration),
    resolvePushSession,
    hasUsername,
    devices: {
      register: (session, device) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createPushDeviceService({ store: createPostgresPushDeviceStore(database), protector: createDeferredWorkerPushTokenProtector(env.PUSH_TOKEN_ENCRYPTION_KEY!) }).register(session, device)),
      unregister: (session, installationId) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createPushDeviceService({ store: createPostgresPushDeviceStore(database), protector: createDeferredWorkerPushTokenProtector(env.PUSH_TOKEN_ENCRYPTION_KEY!) }).unregister(session, installationId)),
    },
  };
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

import { OpenAPIHono } from "@hono/zod-openapi";
import {
  registerBetterAuthCompatibilityRoutes,
  registerPostgresBetterAuthRoutes,
  registerStrictAuthCors,
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
import {
  registerRelationshipsRoutes,
  type RelationshipsRouteDependencies,
} from "./features/relationships/relationships.routes";
import { createHyperdriveRelationshipsStore } from "./features/relationships/shared/relationships.repository";
import type { RelationshipsService } from "./features/relationships/shared/relationship-route";
import type { RelationshipStore } from "./features/relationships/shared/relationship-service";
import { getRelationship } from "./features/relationships/get-relationship/get-relationship.service";
import { getProfileByUsername } from "./features/relationships/get-profile/get-profile.service";
import { listFriendRequests } from "./features/relationships/list-friend-requests/list-friend-requests.service";
import { listFriends } from "./features/relationships/list-friends/list-friends.service";
import { searchUsers } from "./features/relationships/search-users/search-users.service";
import { sendFriendRequest } from "./features/relationships/send-friend-request/send-friend-request.service";
import { acceptFriendRequest } from "./features/relationships/accept-friend-request/accept-friend-request.service";
import { declineFriendRequest } from "./features/relationships/decline-friend-request/decline-friend-request.service";
import { cancelFriendRequest } from "./features/relationships/cancel-friend-request/cancel-friend-request.service";
import { removeFriendship } from "./features/relationships/remove-friendship/remove-friendship.service";
import { blockUser } from "./features/relationships/block-user/block-user.service";
import { unblockUser } from "./features/relationships/unblock-user/unblock-user.service";
import {
  registerCurrentPostingDayRoute,
  type CurrentPostingDayRouteDependencies,
} from "./features/posting-days/get-current-posting-day/get-current-posting-day.route";
import { createCurrentPostingDayService } from "./features/posting-days/get-current-posting-day/get-current-posting-day.service";
import { createDailyPromptRepository, hasPostedOnDay } from "./infrastructure/database/posting-day.repository";
import { createAucklandDayService } from "@dayli/domain";
import { schema, type DayliDatabase } from "@dayli/db";
import { and, eq, gt, sql } from "drizzle-orm";
import type { CreateDailyPostRouteDependencies } from "./features/posts/create-post/create-post.route";
import type { PostTrashRouteDependencies } from "./features/posts/trash-post/trash-post.route";
import type { ListFeedRouteDependencies } from "./features/posts/list-feed/list-feed.route";
import { createHyperdriveFeedRepository } from "./features/posts/list-feed/list-feed.repository";
import type { ListProfilePostsRouteDependencies } from "./features/posts/list-profile-posts/list-profile-posts.route";
import { createHyperdriveProfilePostsRepository } from "./features/posts/list-profile-posts/list-profile-posts.repository";
import type { GetPostRouteDependencies } from "./features/posts/get-post/get-post.route";
import type { GetPostMediaRouteDependencies } from "./features/posts/get-post-media/get-post-media.route";
import { createHyperdrivePostMediaRepository } from "./features/posts/get-post-media/get-post-media.repository";
import type { GetPostVoiceMemoRouteDependencies } from "./features/posts/get-post-voice-memo/get-post-voice-memo.route";
import { createHyperdrivePostVoiceMemoRepository } from "./features/posts/get-post-voice-memo/get-post-voice-memo.repository";
import { createHyperdrivePostDetailRepository } from "./features/posts/shared/post-detail.repository";
import type { UpdatePostRouteDependencies } from "./features/posts/update-post/update-post.route";
import { createHyperdriveUpdatePostRepository } from "./features/posts/update-post/update-post.repository";
import type { ListPostRevisionsRouteDependencies } from "./features/posts/list-post-revisions/list-post-revisions.route";
import { createHyperdrivePostRevisionsRepository } from "./features/posts/list-post-revisions/list-post-revisions.repository";
import { createR2MediaDownloadSigner } from "./features/posts/shared/post-media";
import { registerPostsRoutes } from "./features/posts/posts.routes";
import { createDailyPostService } from "./features/posts/create-post/create-post.service";
import { createHyperdriveDailyPostStore } from "./features/posts/create-post/create-post.repository";
import { registerSystemRoutes } from "./features/system/system.routes";
import { createPresignedDownloadUrl, readR2RuntimeConfiguration } from "./infrastructure/media/r2";
import { registerApplicationCors } from "./http/middleware/cors";
import {
  createActorRateLimiter,
  createIngressRateLimitMiddleware,
  type ApiRateLimitDependencies,
} from "./http/middleware/rate-limit";
import { createCloudflareRateLimitProvider } from "./http/middleware/rate-limit-provider";
import type { AuthenticatedActor, AuthenticatedApiEnv } from "./http/authenticated-actor";
import { registerMessagingRoutes, type MessagingRouteDependencies } from "./features/messaging/messaging.routes";
import { createSendMessageService } from "./features/messaging/messages/send-message/send-message.service";
import {
  createHyperdriveMessageWriteStore,
  createPostgresMessageWriteStore,
} from "./features/messaging/messages/send-message/send-message.repository";
import { createEditMessageService } from "./features/messaging/messages/edit-message/edit-message.service";
import {
  createHyperdriveEditMessageStore,
  createPostgresEditMessageStore,
} from "./features/messaging/messages/edit-message/edit-message.repository";
import { createUnsendMessageService } from "./features/messaging/messages/unsend-message/unsend-message.service";
import {
  createHyperdriveUnsendMessageStore,
  createPostgresUnsendMessageStore,
} from "./features/messaging/messages/unsend-message/unsend-message.repository";
import { createSetReactionService } from "./features/messaging/messages/set-reaction/set-reaction.service";
import {
  createHyperdriveSetReactionStore,
  createPostgresSetReactionStore,
} from "./features/messaging/messages/set-reaction/set-reaction.repository";
import { createRemoveReactionService } from "./features/messaging/messages/remove-reaction/remove-reaction.service";
import {
  createHyperdriveRemoveReactionStore,
  createPostgresRemoveReactionStore,
} from "./features/messaging/messages/remove-reaction/remove-reaction.repository";
import { createCreateDirectConversationService } from "./features/messaging/conversations/create-direct-conversation/create-direct-conversation.service";
import {
  createHyperdriveDirectConversationStore,
  createPostgresDirectConversationStore,
} from "./features/messaging/conversations/create-direct-conversation/create-direct-conversation.repository";
import {
  createHyperdriveGetConversationRepository,
  createPostgresGetConversationRepository,
} from "./features/messaging/conversations/get-conversation/get-conversation.repository";
import {
  createHyperdriveGetDirectConversationRepository,
  createPostgresGetDirectConversationRepository,
} from "./features/messaging/conversations/get-direct-conversation/get-direct-conversation.repository";
import {
  createHyperdriveGetMessageRepository,
  createPostgresGetMessageRepository,
} from "./features/messaging/messages/get-message/get-message.repository";
import {
  createHyperdriveListMessagesRepository,
  createPostgresListMessagesRepository,
} from "./features/messaging/messages/list-messages/list-messages.repository";
import {
  createHyperdriveGetMessagingUnreadRepository,
  createPostgresGetMessagingUnreadRepository,
} from "./features/messaging/conversations/get-messaging-unread/get-messaging-unread.repository";
import {
  createHyperdriveListConversationChangesRepository,
  createPostgresListConversationChangesRepository,
} from "./features/messaging/conversations/list-conversation-changes/list-conversation-changes.repository";
import {
  createHyperdriveMarkConversationReadRepository,
  createPostgresMarkConversationReadRepository,
} from "./features/messaging/conversations/mark-conversation-read/mark-conversation-read.repository";
import {
  createHyperdriveResolveMessageRequestRepository,
  createPostgresResolveMessageRequestRepository,
} from "./features/messaging/conversations/resolve-message-request/resolve-message-request.repository";
import {
  createHyperdriveListConversationsRepository,
  createPostgresListConversationsRepository,
} from "./features/messaging/conversations/list-conversations/list-conversations.repository";
import type { RealtimeTicketRouteDependencies } from "./features/messaging/realtime/issue-ticket/issue-ticket.route";
import { createPostgresRealtimeTicketStore } from "./features/messaging/realtime/issue-ticket/issue-ticket.repository";
import { createRealtimeTicketService } from "./features/messaging/realtime/issue-ticket/issue-ticket.service";
import type { VerifiedRealtimeSession } from "./features/messaging/realtime/shared/realtime-types";
import type { RealtimeConnectRouteDependencies } from "./features/messaging/realtime/connect/connect.route";
import type { RegisterDeviceRouteDependencies } from "./features/messaging/push/register-device/register-device.route";
import { createPostgresRegisterDeviceStore } from "./features/messaging/push/register-device/register-device.repository";
import { createRegisterDeviceService } from "./features/messaging/push/register-device/register-device.service";
import type { UnregisterDeviceRouteDependencies } from "./features/messaging/push/unregister-device/unregister-device.route";
import { createPostgresUnregisterDeviceRepository } from "./features/messaging/push/unregister-device/unregister-device.repository";
import { createDeferredWorkerPushTokenProtector, hasWorkerPushTokenProtection } from "./infrastructure/push/token-encryption";
import { createMessagingDeliveryDispatcher } from "./infrastructure/jobs/messaging-delivery-runtime";
import { createDurableObjectRealtimePublisher } from "./infrastructure/realtime/publisher";
import type { UsernameProfileRouteDependencies } from "./features/profiles/username/username.route";
import { registerProfilesRoutes } from "./features/profiles/profiles.routes";
import type { GetProfileDetailsRouteDependencies } from "./features/profiles/get-profile-details/get-profile-details.route";
import { createHyperdriveProfileDetailsRepository } from "./features/profiles/get-profile-details/get-profile-details.repository";
import type { UpdateProfileRouteDependencies } from "./features/profiles/update-profile/update-profile.route";
import { createHyperdriveUpdateProfileRepository } from "./features/profiles/update-profile/update-profile.repository";
import type { ChangeUsernameRouteDependencies } from "./features/profiles/change-username/change-username.route";
import { createHyperdriveChangeUsernameRepository } from "./features/profiles/change-username/change-username.repository";
import type { GetMoodHistoryRouteDependencies } from "./features/profiles/get-mood-history/get-mood-history.route";
import { createHyperdriveMoodHistoryRepository } from "./features/profiles/get-mood-history/get-mood-history.repository";
import type { SetAvatarRouteDependencies } from "./features/profiles/set-avatar/set-avatar.route";
import { createHyperdriveSetAvatarRepository } from "./features/profiles/set-avatar/set-avatar.repository";
import type { RemoveAvatarRouteDependencies } from "./features/profiles/remove-avatar/remove-avatar.route";
import { createHyperdriveRemoveAvatarRepository } from "./features/profiles/remove-avatar/remove-avatar.repository";
import { createPostgresUsernameProfileStore } from "./features/profiles/username/username.repository";
import { createAccountPolicyMiddleware } from "./features/account-policy/shared/account-policy.middleware";
import { allowsAccountCapability } from "./features/account-policy/shared/account-policy";
import { createHyperdriveAccountPolicyResolver } from "./features/account-policy/shared/account-policy.repository";
import { registerAccountPolicyRoutes, type AccountPolicyRouteDependencies } from "./features/account-policy/account-policy.routes";
import { registerDeletionRoutes, type DeletionRouteDependencies } from "./features/account-lifecycle/deletion/deletion.route";
import { readDeletionStatus } from "./features/account-lifecycle/shared/deletion-status.repository";
import { cancelAccountDeletion } from "./features/account-lifecycle/shared/deletion-commands.repository";
import { registerPasswordReauthenticationRoute, type PasswordReauthenticationDependencies } from "./features/account-policy/reauthenticate/password/password.route";
import { issuePasswordManagementGrant } from "./features/account-policy/reauthenticate/password/password.repository";
import { registerGoogleManagementProofRoute, type GoogleManagementProofDependencies } from "./features/account-policy/reauthenticate/google/google-proof.route";
import { beginGoogleManagementIntent } from "./features/account-policy/reauthenticate/google/google-proof.repository";
import { registerLegalAcceptanceRoute, type LegalAcceptanceRouteDependencies } from "./features/legal/record-acceptance/acceptance.route";
import { recordExplicitLegalAcceptance, type ExplicitLegalAcceptance } from "./features/legal/record-acceptance/acceptance.repository";
import { registerRegistrationIntentRoutes, type RegistrationIntentRouteDependencies } from "./features/legal/registration-intent/registration-intent.route";
import { issueRegistrationIntent, readPublishedRegistrationTerms } from "./features/legal/shared/registration-intent.repository";
import { approvedTermsDigest } from "./features/legal/shared/legal-publication";
import type { ResolveSession } from "./http/middleware/require-session";

type PushDeviceDependencies = RegisterDeviceRouteDependencies & UnregisterDeviceRouteDependencies;
type AccountPolicyDependencies = AccountPolicyRouteDependencies & { resolveSession: ResolveSession };

export interface AppDependencies {
  auth?: BetterAuthCompatibilitySlice;
  media?: MediaReservationRouteDependencies;
  postingDay?: CurrentPostingDayRouteDependencies;
  posts?: CreateDailyPostRouteDependencies;
  postTrash?: PostTrashRouteDependencies;
  feed?: ListFeedRouteDependencies;
  postDetail?: GetPostRouteDependencies;
  postMedia?: GetPostMediaRouteDependencies;
  postVoiceMemo?: GetPostVoiceMemoRouteDependencies;
  profilePosts?: ListProfilePostsRouteDependencies;
  postUpdate?: UpdatePostRouteDependencies;
  postRevisions?: ListPostRevisionsRouteDependencies;
  relationships?: RelationshipsRouteDependencies;
  messaging?: MessagingRouteDependencies;
  realtimeTicket?: RealtimeTicketRouteDependencies;
  realtimeConnect?: RealtimeConnectRouteDependencies;
  pushDevices?: PushDeviceDependencies;
  usernameProfile?: UsernameProfileRouteDependencies;
  profileDetails?: GetProfileDetailsRouteDependencies;
  profileUpdate?: UpdateProfileRouteDependencies;
  usernameChange?: ChangeUsernameRouteDependencies;
  avatarSet?: SetAvatarRouteDependencies;
  avatarRemove?: RemoveAvatarRouteDependencies;
  moodHistory?: GetMoodHistoryRouteDependencies;
  accountPolicy?: AccountPolicyDependencies;
  deletion?: DeletionRouteDependencies;
  passwordReauthentication?: PasswordReauthenticationDependencies;
  googleManagementProof?: GoogleManagementProofDependencies;
  legalAcceptance?: LegalAcceptanceRouteDependencies;
  legalRegistration?: RegistrationIntentRouteDependencies;
  /** Exact browser origins allowed to call /api/v1 with credentials. */
  trustedOrigins?: readonly string[];
  /** Native Cloudflare rate-limit adapters. Omit only in DB-free route composition. */
  rateLimiting?: ApiRateLimitDependencies;
}

export function createApp({
  auth,
  media,
  postingDay,
  posts,
  postTrash,
  feed,
  postDetail,
  postMedia,
  postVoiceMemo,
  profilePosts,
  postUpdate,
  postRevisions,
  relationships = unavailableRelationships,
  messaging = unavailableMessaging,
  realtimeTicket = unavailableRealtimeTicket,
  realtimeConnect = {},
  pushDevices = unavailablePushDevices,
  usernameProfile = unavailableUsernameProfile,
  profileDetails,
  profileUpdate,
  usernameChange,
  avatarSet,
  avatarRemove,
  moodHistory,
  accountPolicy,
  deletion,
  passwordReauthentication,
  googleManagementProof,
  legalAcceptance,
  legalRegistration,
  trustedOrigins = [],
  rateLimiting,
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
  const authOrigins = auth?.trustedOrigins ?? trustedOrigins;
  if (authOrigins.length > 0) registerStrictAuthCors(api, authOrigins);
  if (rateLimiting) {
    api.use("/api/v1/*", createIngressRateLimitMiddleware(rateLimiting));
    api.use("/api/auth/*", createIngressRateLimitMiddleware(rateLimiting));
  }
  const rateLimiter = rateLimiting ? createActorRateLimiter(rateLimiting) : undefined;
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
  if (accountPolicy?.policies) {
    api.use("/api/v1/*", createAccountPolicyMiddleware(accountPolicy.resolveSession, accountPolicy.policies));
  }
  registerSystemRoutes(api);
  registerAccountPolicyRoutes(api, accountPolicy ?? {});
  registerDeletionRoutes(api, { ...(deletion ?? { resolveSession: async () => null }), rateLimiter: rateLimiter ?? deletion?.rateLimiter });
  registerPasswordReauthenticationRoute(api, { ...(passwordReauthentication ?? { resolveSession: async () => null }), rateLimiter: rateLimiter ?? passwordReauthentication?.rateLimiter });
  registerGoogleManagementProofRoute(api, { ...(googleManagementProof ?? { resolveSession: async () => null }), rateLimiter: rateLimiter ?? googleManagementProof?.rateLimiter });
  registerLegalAcceptanceRoute(api, legalAcceptance ?? { resolveSession: async () => null });
  registerRegistrationIntentRoutes(api, legalRegistration ?? {});
  registerMediaReservationRoutes(api, { ...media, rateLimiter });
  registerCurrentPostingDayRoute(api, { ...(postingDay ?? { resolveSession: async () => null }), rateLimiter });
  registerPostsRoutes(api, {
    create: { ...(posts ?? { resolveSession: async () => null }), rateLimiter },
    feed: { ...(feed ?? { resolveSession: async () => null }), rateLimiter },
    detail: { ...(postDetail ?? { resolveSession: async () => null }), rateLimiter },
    media: { ...(postMedia ?? { resolveSession: async () => null }), rateLimiter },
    voiceMemo: { ...(postVoiceMemo ?? { resolveSession: async () => null }), rateLimiter },
    profilePosts: { ...(profilePosts ?? { resolveSession: async () => null }), rateLimiter },
    trash: { ...(postTrash ?? { resolveSession: async () => null }), rateLimiter },
    update: { ...(postUpdate ?? { resolveSession: async () => null }), rateLimiter },
    revisions: { ...(postRevisions ?? { resolveSession: async () => null }), rateLimiter },
  });
  registerRelationshipsRoutes(api, { ...relationships, rateLimiter });
  registerMessagingRoutes(api, {
    ...messaging,
    realtimeTicket,
    pushDevices,
    realtimeConnect,
    rateLimiter,
  });
  registerProfilesRoutes(api, {
    username: { ...usernameProfile, rateLimiter },
    details: { ...(profileDetails ?? { resolveSession: async () => null }), rateLimiter },
    update: { ...(profileUpdate ?? { resolveSession: async () => null }), rateLimiter },
    changeUsername: { ...(usernameChange ?? { resolveSession: async () => null }), rateLimiter },
    setAvatar: { ...(avatarSet ?? { resolveSession: async () => null }), rateLimiter },
    removeAvatar: { ...(avatarRemove ?? { resolveSession: async () => null }), rateLimiter },
    moodHistory: { ...(moodHistory ?? { resolveSession: async () => null }), rateLimiter },
  });

  api.doc("/api/v1/openapi.json", {
    openapi: "3.0.3",
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
  const signMediaDownload = r2Runtime ? createR2MediaDownloadSigner(r2Runtime) : undefined;
  const feed = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveFeedRepository(configuration.hyperdrive),
    signMediaDownload,
  } satisfies ListFeedRouteDependencies : undefined;
  const postDetail = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdrivePostDetailRepository(configuration.hyperdrive),
    signMediaDownload,
  } satisfies GetPostRouteDependencies : undefined;
  const postMedia = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdrivePostMediaRepository(configuration.hyperdrive),
    signMediaDownload,
  } satisfies GetPostMediaRouteDependencies : undefined;
  const postVoiceMemo = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdrivePostVoiceMemoRepository(configuration.hyperdrive),
    signMediaDownload,
  } satisfies GetPostVoiceMemoRouteDependencies : undefined;
  const profilePosts = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveProfilePostsRepository(configuration.hyperdrive),
    signMediaDownload,
  } satisfies ListProfilePostsRouteDependencies : undefined;
  const postUpdate = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveUpdatePostRepository(configuration.hyperdrive),
    detail: createHyperdrivePostDetailRepository(configuration.hyperdrive),
    signMediaDownload,
  } satisfies UpdatePostRouteDependencies : undefined;
  const postRevisions = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdrivePostRevisionsRepository(configuration.hyperdrive),
  } satisfies ListPostRevisionsRouteDependencies : undefined;
  const hasUsername = configuration ? createUsernameChecker(configuration) : undefined;
  const messaging = configuration ? createMessagingDependencies(configuration, env, hasUsername!) : undefined;
  const realtime = configuration && env.USER_REALTIME ? createRealtimeDependencies(configuration, env, hasUsername!) : undefined;
  const pushDevices = configuration ? createPushDeviceDependencies(configuration, env, hasUsername!) : undefined;
  const usernameProfile = configuration ? {
    resolveSession: createSessionResolver(configuration),
    store: withHyperdriveUsernameProfileStore(configuration),
  } satisfies UsernameProfileRouteDependencies : undefined;
  const accountPolicy = configuration ? {
    resolveSession: createSessionResolver(configuration),
    policies: createHyperdriveAccountPolicyResolver(configuration.hyperdrive),
  } satisfies AccountPolicyDependencies : undefined;
  const deletion = configuration ? {
    resolveSession: createSessionResolver(configuration),
    status: (userId: string) => withHyperdriveDatabase(configuration.hyperdrive, (database) => readDeletionStatus(database, userId)),
    cancel: (input: Parameters<typeof cancelAccountDeletion>[1]) => withHyperdriveDatabase(
      configuration.hyperdrive, (database) => cancelAccountDeletion(database, input),
    ),
    // Request execution stays unregistered until the synthetic-staging gate is reviewed.
    requestEnabled: false,
  } satisfies DeletionRouteDependencies : undefined;
  const passwordReauthentication = configuration ? {
    resolveSession: createSessionResolver(configuration),
    issue: (input: Parameters<typeof issuePasswordManagementGrant>[1]) => withHyperdriveDatabase(
      configuration.hyperdrive, (database) => issuePasswordManagementGrant(database, input),
    ),
  } satisfies PasswordReauthenticationDependencies : undefined;
  const googleManagementProof = configuration?.google ? {
    resolveSession: createSessionResolver(configuration),
    begin: (input: Omit<Parameters<typeof beginGoogleManagementIntent>[1], "configuration">) => withHyperdriveDatabase(
      configuration.hyperdrive, (database) => beginGoogleManagementIntent(database, {
        ...input,
        configuration: {
          clientId: configuration.google!.clientIds[0],
          clientSecret: configuration.google!.clientSecret,
          redirectUri: new URL("/api/auth/callback/google", configuration.baseURL).href,
        },
      }),
    ),
  } satisfies GoogleManagementProofDependencies : undefined;
  const legalAcceptance = configuration ? {
    resolveSession: createSessionResolver(configuration),
    record: async (userId: string, input: ExplicitLegalAcceptance) => {
      if (await approvedTermsDigest() !== input.termsContentDigest) return { status: "unavailable" as const };
      return withHyperdriveDatabase(configuration.hyperdrive, (database) => recordExplicitLegalAcceptance(database, userId, input));
    },
  } satisfies LegalAcceptanceRouteDependencies : undefined;
  const legalRegistration = configuration ? {
    current: async () => withHyperdriveDatabase(configuration.hyperdrive, async (database) => (
      readPublishedRegistrationTerms(database, await approvedTermsDigest())
    )),
    issue: async (input: import("./features/legal/shared/registration-intent.repository").RegistrationIntentRequest) => withHyperdriveDatabase(
      configuration.hyperdrive, async (database) => issueRegistrationIntent(database, input, await approvedTermsDigest()),
    ),
  } satisfies RegistrationIntentRouteDependencies : undefined;
  // Profile photos are shown through links that expire after ten minutes.
  const signAvatar = r2Runtime
    ? async (objectKey: string) => (await createPresignedDownloadUrl(r2Runtime, { objectKey, expiresInSeconds: 10 * 60 })).url
    : undefined;
  const profileDetails = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveProfileDetailsRepository(configuration.hyperdrive, signAvatar),
  } satisfies GetProfileDetailsRouteDependencies : undefined;
  const profileUpdate = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveUpdateProfileRepository(configuration.hyperdrive, signAvatar),
  } satisfies UpdateProfileRouteDependencies : undefined;
  // Without R2 there is nothing to link, so the photo routes stay unavailable.
  const avatarSet = configuration && r2Runtime ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveSetAvatarRepository(configuration.hyperdrive, signAvatar),
  } satisfies SetAvatarRouteDependencies : undefined;
  const avatarRemove = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveRemoveAvatarRepository(configuration.hyperdrive, signAvatar),
  } satisfies RemoveAvatarRouteDependencies : undefined;
  const usernameChange = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveChangeUsernameRepository(configuration.hyperdrive),
  } satisfies ChangeUsernameRouteDependencies : undefined;
  const moodHistory = configuration ? {
    resolveSession: createSessionResolver(configuration),
    repository: createHyperdriveMoodHistoryRepository(configuration.hyperdrive),
  } satisfies GetMoodHistoryRouteDependencies : undefined;
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
    feed,
    postDetail,
    postMedia,
    postVoiceMemo,
    profilePosts,
    postUpdate,
      postRevisions,
    media,
    relationships,
    messaging,
    realtimeTicket: realtime?.ticket,
    realtimeConnect: realtime?.connect,
    pushDevices,
    usernameProfile,
    accountPolicy,
    deletion,
    passwordReauthentication,
    googleManagementProof,
    legalAcceptance,
    legalRegistration,
    profileDetails,
    profileUpdate,
    usernameChange,
    avatarSet,
    avatarRemove,
    moodHistory,
    trustedOrigins: configuration?.trustedOrigins,
    rateLimiting: {
      environmentScope: env.API_RATE_LIMIT_SCOPE,
      provider: createCloudflareRateLimitProvider({
        bindings: {
          ingress: env.API_INGRESS_RATE_LIMIT,
          read: env.API_READ_RATE_LIMIT,
          write: env.API_WRITE_RATE_LIMIT,
          message: env.API_MESSAGE_RATE_LIMIT,
          media: env.API_MEDIA_RATE_LIMIT,
          realtime: env.API_REALTIME_RATE_LIMIT,
          directPush: env.API_DIRECT_PUSH_RATE_LIMIT,
        },
        onOperationalAlert: () => console.error("dayli rate limit backend unavailable"),
      }),
    },
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
  policyAllowsOrdinary: async () => false,
};
const unavailablePushDevices: PushDeviceDependencies = { resolveSession: async () => null, resolvePushSession: async () => null };

const unavailableRelationships: RelationshipsRouteDependencies = {  service: {
    getStatus: async () => { throw new Error("Relationship storage is unavailable."); },
    listPendingRequests: async () => { throw new Error("Relationship storage is unavailable."); },
    listFriends: async () => { throw new Error("Relationship storage is unavailable."); },
    searchUsers: async () => { throw new Error("Relationship storage is unavailable."); },
    getProfileByUsername: async () => { throw new Error("Relationship storage is unavailable."); },
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

export function createMessagingPersistenceServices(database: DayliDatabase, options: { now?: () => Date } = {}) {
  const store = createPostgresMessageWriteStore(database);
  return {
    direct: createCreateDirectConversationService({ store: createPostgresDirectConversationStore(database), now: options.now }),
    resolveMessageRequest: createPostgresResolveMessageRequestRepository(database),
    markConversationRead: createPostgresMarkConversationReadRepository(database),
    getMessagingUnread: createPostgresGetMessagingUnreadRepository(database),
    listConversationChanges: createPostgresListConversationChangesRepository(database),
    listConversations: createPostgresListConversationsRepository(database),
    getConversation: createPostgresGetConversationRepository(database),
    findDirectConversation: createPostgresGetDirectConversationRepository(database),
    getMessage: createPostgresGetMessageRepository(database),
    listMessages: createPostgresListMessagesRepository(database),
    send: createSendMessageService({ store, now: options.now }),
    edit: createEditMessageService({ store: createPostgresEditMessageStore(database), now: options.now }),
    unsend: createUnsendMessageService({ store: createPostgresUnsendMessageStore(database), now: options.now }),
    set: createSetReactionService({ store: createPostgresSetReactionStore(database) }),
    remove: createRemoveReactionService({ store: createPostgresRemoveReactionStore(database) }),
  };
}

export function createRelationshipsService(store: RelationshipStore, options: { now?: () => Date } = {}): RelationshipsService {
  const dependencies = { store, now: options.now ?? (() => new Date()) };
  return {
    getStatus: (actorId, subjectId) => getRelationship(dependencies, actorId, subjectId),
    listPendingRequests: (actorId, direction, limit, cursor) => listFriendRequests(dependencies, actorId, direction, limit, cursor),
    listFriends: (actorId, limit, cursor) => listFriends(dependencies, actorId, limit, cursor),
    searchUsers: (actorId, query, limit, cursor) => searchUsers(dependencies, actorId, query, limit, cursor),
    getProfileByUsername: (actorId, username) => getProfileByUsername(dependencies, actorId, username),
    sendRequest: (actorId, recipientId) => sendFriendRequest(dependencies, actorId, recipientId),
    acceptRequest: (actorId, requestId) => acceptFriendRequest(dependencies, actorId, requestId),
    declineRequest: (actorId, requestId) => declineFriendRequest(dependencies, actorId, requestId),
    cancelRequest: (actorId, requestId) => cancelFriendRequest(dependencies, actorId, requestId),
    removeFriendship: (actorId, subjectId) => removeFriendship(dependencies, actorId, subjectId),
    block: (actorId, subjectId) => blockUser(dependencies, actorId, subjectId),
    unblock: (actorId, subjectId) => unblockUser(dependencies, actorId, subjectId),
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
    return session?.user?.id && session.session?.id
      ? { userId: session.user.id, sessionId: session.session.id }
      : null;
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
    const [row] = await database
      .select({ id: schema.session.id, userId: schema.session.userId, expiresAt: schema.session.expiresAt })
      .from(schema.session)
      .where(and(
        eq(schema.session.id, sessionId),
        gt(schema.session.expiresAt, sql`now()`),
      ))
      .limit(1);
    return row ? { sessionId: row.id, userId: row.userId, expiresAt: row.expiresAt } : null;
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
    edit: createEditMessageService({ store: createHyperdriveEditMessageStore(configuration.hyperdrive) }),
    unsend: createUnsendMessageService({ store: createHyperdriveUnsendMessageStore(configuration.hyperdrive) }),
    setReaction: createSetReactionService({ store: createHyperdriveSetReactionStore(configuration.hyperdrive) }),
    removeReaction: createRemoveReactionService({ store: createHyperdriveRemoveReactionStore(configuration.hyperdrive) }),
    direct: createCreateDirectConversationService({ store: createHyperdriveDirectConversationStore(configuration.hyperdrive) }),
    resolveMessageRequest: createHyperdriveResolveMessageRequestRepository(configuration.hyperdrive),
    markConversationRead: createHyperdriveMarkConversationReadRepository(configuration.hyperdrive),
    getMessagingUnread: createHyperdriveGetMessagingUnreadRepository(configuration.hyperdrive),
    listConversationChanges: createHyperdriveListConversationChangesRepository(configuration.hyperdrive),
    listConversations: createHyperdriveListConversationsRepository(configuration.hyperdrive),
    getConversation: createHyperdriveGetConversationRepository(configuration.hyperdrive),
    findDirectConversation: createHyperdriveGetDirectConversationRepository(configuration.hyperdrive),
    getMessage: createHyperdriveGetMessageRepository(configuration.hyperdrive),
    listMessages: createHyperdriveListMessagesRepository(configuration.hyperdrive),
    dispatchImmediately: userRealtime ? () => createMessagingDeliveryDispatcher({ ...env, USER_REALTIME: userRealtime }).dispatchImmediately() : undefined,
  };
}

function createRealtimeDependencies(
  configuration: RuntimeConfiguration,
  env: ApiEnv,
  hasUsername: NonNullable<ReturnType<typeof createUsernameChecker>>,
): { ticket: RealtimeTicketRouteDependencies; connect: RealtimeConnectRouteDependencies } {
  const policies = createHyperdriveAccountPolicyResolver(configuration.hyperdrive);
  const policyAllowsOrdinary = async (userId: string) => allowsAccountCapability(await policies.resolve(userId), "ordinary");
  const resolveRealtimeSession = createVerifiedRealtimeSessionResolver(configuration);
  const tickets = {
    issue: async (session: VerifiedRealtimeSession) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createRealtimeTicketService({ store: createPostgresRealtimeTicketStore(database) }).issue(session)),
    consume: async (ticket: string) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createRealtimeTicketService({ store: createPostgresRealtimeTicketStore(database) }).consume(ticket)),
  };
  const webSocketUrl = new URL("/api/v1/realtime/connect", configuration.publicApiBaseURL);
  webSocketUrl.protocol = webSocketUrl.protocol === "https:" ? "wss:" : "ws:";
  const connect: RealtimeConnectRouteDependencies = {
    tickets,
    resolveActiveSession: async (sessionId) => resolveRealtimeSessionById(configuration, sessionId),
    userRealtime: env.USER_REALTIME!,
    trustedOrigins: configuration.trustedOrigins,
    hasUsername,
    policyAllowsOrdinary,
  };
  return { ticket: { resolveSession: createSessionResolver(configuration), resolveRealtimeSession, tickets, webSocketUrl: webSocketUrl.toString(), hasUsername, policyAllowsOrdinary }, connect };
}

function createPushDeviceDependencies(
  configuration: RuntimeConfiguration,
  env: ApiEnv,
  hasUsername: NonNullable<ReturnType<typeof createUsernameChecker>>,
): PushDeviceDependencies {
  const resolvePushSession = createVerifiedRealtimeSessionResolver(configuration);
  if (!hasWorkerPushTokenProtection(env.PUSH_TOKEN_ENCRYPTION_KEY)) return { resolveSession: createSessionResolver(configuration), resolvePushSession, hasUsername };
  return {
    resolveSession: createSessionResolver(configuration),
    resolvePushSession,
    hasUsername,
    register: {
      register: (session, device) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createRegisterDeviceService({ store: createPostgresRegisterDeviceStore(database), protector: createDeferredWorkerPushTokenProtector(env.PUSH_TOKEN_ENCRYPTION_KEY!) }).register(session, device)),
    },
    unregister: {
      unregister: (actorId, installationId) => withHyperdriveDatabase(configuration.hyperdrive, (database) => createPostgresUnregisterDeviceRepository(database).unregister(actorId, installationId)),
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

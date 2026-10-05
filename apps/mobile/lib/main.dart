import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/feed_client.dart';
import 'api/profile_client.dart';
import 'api/post_client.dart';
import 'api/friends_client.dart';
import 'api/interactions_client.dart';
import 'api/media_upload_client.dart';
import 'api/posting_day_client.dart';
import 'app/app.dart';
import 'app/app_scope.dart';
import 'app/config.dart';
import 'app/development_ca.dart';
import 'app/fresh_install.dart';
import 'app/session_integrations.dart';
import 'auth/native_session.dart';
import 'auth/session_controller.dart';
import 'auth/biometric_service.dart';
import 'compose/media_compressor.dart';
import 'compose/pending_capture.dart';
import 'drafts/draft_store.dart';
import 'messaging/messaging_client.dart';
import 'messaging/messaging_controller.dart';
import 'notifications/firebase_push_source.dart';
import 'notifications/notification_consent.dart';
import 'notifications/notification_event.dart';
import 'notifications/notification_presenter.dart';
import 'notifications/notification_router.dart';
import 'notifications/push_registration_client.dart';
import 'notifications/push_service.dart';
import 'posts/post_submitter.dart';
import 'profile/streak_cache.dart';
import 'settings/account_export_client.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();

  // Debug only: trust a local development CA in Dart's HTTP stack, which
  // ignores Android user CAs. See docs/dayli/environments.md.
  if (kDebugMode) {
    final ca = developmentCaBytes(
      const String.fromEnvironment(developmentCaDefine),
    );
    if (ca != null) {
      SecurityContext.defaultContext.setTrustedCertificatesBytes(ca);
    }
  }

  // One protected store shared by the session token, identity cache, and
  // drafts so a reinstall wipe covers all of them.
  const secureStorage = FlutterSecureStorage(
    aOptions: AndroidOptions(),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.unlocked_this_device,
    ),
  );
  final prefs = await SharedPreferences.getInstance();
  await clearProtectedStorageAfterReinstall(
    preferences: Future.value(prefs),
    secureStorage: secureStorage,
  );
  final biometric = BiometricService(
    SharedPreferencesBiometricStore(prefs),
    LocalAuthentication(),
  );

  final tokenStore = ProtectedSessionTokenStore(storage: secureStorage);
  final drafts = ProtectedDraftStore(storage: secureStorage);
  final streakCache = ProtectedStreakCache(secureStorage);
  // Shared so sign-out deletes the compressed media the composer saved.
  final mediaCompressor = DeviceMediaCompressor();
  final pendingCaptures = PendingCaptures(
    store: ProtectedPendingCaptureStore(storage: secureStorage),
  );
  final nativeSession = BetterAuthNativeSession(
    baseUrl: config.apiBaseUrl,
    tokenStore: tokenStore,
  );
  late final SessionController session;
  void policyDenied() => session.authenticatedApiForbidden();
  configureAuthenticatedApiForbiddenHandler(policyDenied);
  final messagingClient = HttpMessagingClient(
    baseUrl: config.apiBaseUrl,
    bearerToken: nativeSession.bearerToken,
    onForbidden: policyDenied,
  );
  final friendsClient = GeneratedFriendsClient(
    baseUrl: config.apiBaseUrl,
    bearerToken: nativeSession.bearerToken,
    onForbidden: policyDenied,
  );
  final feedClient = GeneratedFeedClient(
    baseUrl: config.apiBaseUrl,
    bearerToken: nativeSession.bearerToken,
  );
  final postingDayClient = GeneratedPostingDayClient(
    baseUrl: config.apiBaseUrl,
    bearerToken: nativeSession.bearerToken,
    onForbidden: policyDenied,
  );
  final messaging = MessagingController(messagingClient);
  PushService? push;
  FirebasePushLifecycle? notifications;
  NotificationPreflight? notificationPreflight;
  if (await initializeFirebasePushIfConfigured(config.firebaseConfigured)) {
    final preflight = ApiNotificationPreflight(
      messaging: messagingClient,
      friends: friendsClient,
      postingDays: postingDayClient,
      feed: feedClient,
    );
    notificationPreflight = preflight;
    push = PushService(
      source: FirebasePushTokenSource(),
      client: HttpPushRegistrationClient(
        baseUrl: config.apiBaseUrl,
        bearerToken: nativeSession.bearerToken,
      ),
      installationId: await loadInstallationId(secureStorage),
      platform: Platform.isIOS ? 'ios' : 'android',
    );
    notifications = FirebasePushLifecycle(
      presenter: LocalNotificationPresenter(),
      onForegroundEvent: (event) async {
        final authorized = await preflight.authorize(event);
        if (authorized && event.kind == NotificationKind.directMessage) {
          await messaging.refreshInbox();
        }
        return authorized;
      },
      // DayliApp replaces this callback with session-fenced routing.
      onNotificationTap: (_) {},
    );
  }
  final notificationConsent = NotificationConsentController(
    client: HttpNotificationPreferenceClient(
      baseUrl: config.apiBaseUrl,
      bearerToken: nativeSession.bearerToken,
    ),
    push: push,
    lifecycle: notifications,
  );
  final integrations = SessionIntegrations(
    startRealtime: messaging.startRealtime,
    stopRealtime: messaging.stopRealtime,
    clearMessaging: messaging.clear,
    startPush: notificationConsent.start,
    stopPush: notificationConsent.clear,
  );
  session = SessionController(
    session: nativeSession,
    tokenStore: tokenStore,
    userCache: ProtectedSessionUserCache(secureStorage),
    drafts: drafts,
    clearUserMedia: (userId) async {
      await mediaCompressor.discardAll(userId);
      await pendingCaptures.discardFor(userId);
    },
    onSignedIn: integrations.start,
    // Must run before Better Auth stores a replacement token. [clear] always
    // stops and clears messaging, then rethrows any unsafe push cleanup error.
    onBeforeSessionReplacement: () =>
        _clearEach([streakCache.clear, integrations.clear]),
    onPrivateDataClear: () =>
        _clearEach([streakCache.clear, integrations.clear]),
  );

  runApp(
    DayliApp(
      services: AppServices(
        session: session,
        postingDays: postingDayClient,
        feed: feedClient,
        posts: GeneratedPostClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        friends: friendsClient,
        profiles: GeneratedProfileClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        interactions: GeneratedInteractionsClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
          onForbidden: policyDenied,
        ),
        drafts: drafts,
        messaging: messaging,
        notifications: notifications,
        notificationConsent: notificationConsent,
        notificationPreflight: notificationPreflight,
        accountExports: config.accountExportEnabled
            ? HttpAccountExportClient(
                baseUrl: config.apiBaseUrl,
                bearerToken: nativeSession.bearerToken,
              )
            : null,
        google: config.googleSignInConfigured
            ? FlutterGoogleIdTokenProvider(
                webClientId: config.googleWebClientId,
                iosClientId: config.googleIosClientId,
              )
            : null,
        submitter: GeneratedPostSubmitter(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
          onForbidden: policyDenied,
        ),
        mediaCompressor: mediaCompressor,
        streakCache: streakCache,
        pendingCaptures: pendingCaptures,
        mediaUploads: GeneratedMediaUploadClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        biometric: biometric,
      ),
    ),
  );
}

/// Runs every cleanup step even when an earlier one fails, then rethrows the
/// first failure so the session doesn't treat private data as removed.
Future<void> _clearEach(List<Future<void> Function()> steps) async {
  (Object, StackTrace)? failure;
  for (final step in steps) {
    try {
      await step();
    } catch (error, stackTrace) {
      failure ??= (error, stackTrace);
    }
  }
  if (failure case (final error, final stackTrace)) {
    Error.throwWithStackTrace(error, stackTrace);
  }
}

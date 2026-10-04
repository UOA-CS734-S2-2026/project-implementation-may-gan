import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/feed_client.dart';
import 'api/profile_client.dart';
import 'api/post_client.dart';
import 'api/friends_client.dart';
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
import 'compose/media_compressor.dart';
import 'compose/pending_capture.dart';
import 'drafts/draft_store.dart';
import 'messaging/messaging_client.dart';
import 'messaging/messaging_controller.dart';
import 'notifications/firebase_push_source.dart';
import 'notifications/push_registration_client.dart';
import 'notifications/push_service.dart';
import 'posts/post_submitter.dart';
import 'settings/account_export_client.dart';

// A separate release change must enable this after provider and privacy review.
const nativeExportEnabled = false;

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
  await clearProtectedStorageAfterReinstall(
    preferences: SharedPreferences.getInstance(),
    secureStorage: secureStorage,
  );

  final tokenStore = ProtectedSessionTokenStore(storage: secureStorage);
  final drafts = ProtectedDraftStore(storage: secureStorage);
  // Shared so sign-out deletes the compressed media the composer saved.
  final mediaCompressor = DeviceMediaCompressor();
  final pendingCaptures = PendingCaptures(
    store: ProtectedPendingCaptureStore(storage: secureStorage),
  );
  final nativeSession = BetterAuthNativeSession(
    baseUrl: config.apiBaseUrl,
    tokenStore: tokenStore,
  );
  final messagingClient = HttpMessagingClient(
    baseUrl: config.apiBaseUrl,
    bearerToken: nativeSession.bearerToken,
  );
  final messaging = MessagingController(messagingClient);
  PushService? push;
  FirebasePushLifecycle? notifications;
  if (config.firebaseConfigured) {
    await initializeFirebasePush();
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
      onForegroundData: (_) => messaging.refreshInbox(),
      // DayliApp replaces this callback with deferred authenticated routing.
      onNotificationTap: (_) {},
    );
  }
  final integrations = SessionIntegrations(
    startRealtime: messaging.startRealtime,
    stopRealtime: messaging.stopRealtime,
    clearMessaging: messaging.clear,
    startPush: () async {
      await push?.start();
    },
    stopPush: () async {
      await push?.stop();
    },
  );
  final session = SessionController(
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
    onBeforeSessionReplacement: integrations.clear,
    onPrivateDataClear: integrations.clear,
  );

  runApp(
    DayliApp(
      services: AppServices(
        session: session,
        postingDays: GeneratedPostingDayClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        feed: GeneratedFeedClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        posts: GeneratedPostClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        friends: GeneratedFriendsClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        profiles: GeneratedProfileClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        drafts: drafts,
        messaging: messaging,
        notifications: notifications,
        accountExports: nativeExportEnabled
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
        ),
        mediaCompressor: mediaCompressor,
        pendingCaptures: pendingCaptures,
        mediaUploads: GeneratedMediaUploadClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
      ),
    ),
  );
}

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/friends_client.dart';
import 'api/posting_day_client.dart';
import 'app/app.dart';
import 'app/app_scope.dart';
import 'app/config.dart';
import 'app/fresh_install.dart';
import 'auth/native_session.dart';
import 'auth/session_controller.dart';
import 'drafts/draft_store.dart';
import 'messaging/messaging_client.dart';
import 'messaging/messaging_controller.dart';
import 'notifications/firebase_push_source.dart';
import 'notifications/push_registration_client.dart';
import 'notifications/push_service.dart';
import 'posts/post_submitter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();

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
  final nativeSession = BetterAuthNativeSession(
    baseUrl: config.apiBaseUrl,
    tokenStore: tokenStore,
  );
  final messaging = MessagingController(
    HttpMessagingClient(
      baseUrl: config.apiBaseUrl,
      bearerToken: nativeSession.bearerToken,
    ),
  );
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
  final session = SessionController(
    session: nativeSession,
    tokenStore: tokenStore,
    userCache: ProtectedSessionUserCache(secureStorage),
    drafts: drafts,
    onSignedIn: push?.start,
    onPrivateDataClear: () async {
      await push?.stop();
      messaging.clear();
    },
  );

  runApp(
    DayliApp(
      services: AppServices(
        session: session,
        postingDays: GeneratedPostingDayClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        friends: GeneratedFriendsClient(
          baseUrl: config.apiBaseUrl,
          bearerToken: nativeSession.bearerToken,
        ),
        drafts: drafts,
        messaging: messaging,
        notifications: notifications,
        google: config.googleSignInConfigured
            ? FlutterGoogleIdTokenProvider(
                webClientId: config.googleWebClientId,
                iosClientId: config.googleIosClientId,
              )
            : null,
        // Replaced by the generated posts client once #16 is merged.
        submitter: const UnavailablePostSubmitter(),
      ),
    ),
  );
}

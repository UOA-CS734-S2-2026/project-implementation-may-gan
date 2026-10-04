import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';
import 'push_service.dart';

/// Firebase-backed token source. Call [initializeFirebasePushIfConfigured]
/// before constructing it.
class FirebasePushTokenSource implements PushTokenSource {
  FirebasePushTokenSource([FirebaseMessaging? messaging])
    : _messaging = messaging ?? FirebaseMessaging.instance;

  final FirebaseMessaging _messaging;

  @override
  Future<PushPermission> requestPermission() async {
    final settings = await _messaging.requestPermission();
    return switch (settings.authorizationStatus) {
      AuthorizationStatus.authorized => PushPermission.granted,
      AuthorizationStatus.provisional => PushPermission.provisional,
      _ => PushPermission.denied,
    };
  }

  @override
  Future<String?> currentToken() => _messaging.getToken();

  @override
  Stream<String> get tokenRefreshes => _messaging.onTokenRefresh;

  @override
  Future<void> invalidateLocalToken() => _messaging.deleteToken();
}

/// Registers Firebase handlers without showing a foreground OS banner. The
/// app refreshes through its authenticated REST/realtime coordinator instead.
class FirebasePushLifecycle {
  FirebasePushLifecycle({
    required this.onForegroundData,
    required this.onNotificationTap,
  });

  final FutureOr<void> Function(Map<String, String> data) onForegroundData;
  FutureOr<void> Function(String conversationId) onNotificationTap;
  StreamSubscription<RemoteMessage>? _foreground;
  StreamSubscription<RemoteMessage>? _opened;

  void setNotificationTapHandler(
    FutureOr<void> Function(String conversationId) handler,
  ) {
    onNotificationTap = handler;
  }

  Future<void> start() async {
    _foreground ??= FirebaseMessaging.onMessage.listen((message) {
      final data = <String, String>{
        for (final entry in message.data.entries)
          if (entry.value is String) entry.key: entry.value as String,
      };
      unawaited(Future<void>.sync(() => onForegroundData(data)));
    });
    _opened ??= FirebaseMessaging.onMessageOpenedApp.listen(_handleTap);
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) await _handleTap(initial);
  }

  Future<void> stop() async {
    await _foreground?.cancel();
    await _opened?.cancel();
    _foreground = null;
    _opened = null;
  }

  Future<void> _handleTap(RemoteMessage message) async {
    final conversationId = message.data['conversationId'];
    if (conversationId != null && conversationId.isNotEmpty) {
      // Navigation input is only a hint. The destination must fetch REST data
      // under the current session before rendering the conversation.
      await onNotificationTap(conversationId);
    }
  }
}

typedef FirebaseAppInitializer = Future<void> Function(FirebaseOptions options);
typedef BackgroundMessageRegistrar =
    void Function(BackgroundMessageHandler handler);

Future<void> _initializeFirebaseApp(FirebaseOptions options) async {
  await Firebase.initializeApp(options: options);
}

/// Initializes the registered staging app from explicit client metadata.
///
/// Both foreground startup and the background isolate use this function so
/// they cannot select different Firebase projects.
Future<void> initializeStagingFirebaseApp({
  TargetPlatform? platform,
  bool debugMode = kDebugMode,
  FirebaseAppInitializer initializer = _initializeFirebaseApp,
}) => initializer(
  stagingFirebaseOptions(platform: platform, debugMode: debugMode),
);

/// Must remain a top-level VM entrypoint. It intentionally does no navigation
/// and does not display or persist message content.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage _) async {
  await initializeStagingFirebaseApp();
}

/// Initializes push only when the build has explicitly opted in.
///
/// The switch defaults to false. An enabled release or profile build fails
/// closed because [stagingFirebaseOptions] rejects non-debug builds.
Future<bool> initializeFirebasePushIfConfigured(
  bool configured, {
  TargetPlatform? platform,
  bool debugMode = kDebugMode,
  FirebaseAppInitializer initializer = _initializeFirebaseApp,
  BackgroundMessageRegistrar registerBackgroundHandler =
      FirebaseMessaging.onBackgroundMessage,
}) async {
  if (!configured) return false;

  await initializeStagingFirebaseApp(
    platform: platform,
    debugMode: debugMode,
    initializer: initializer,
  );
  registerBackgroundHandler(firebaseMessagingBackgroundHandler);
  return true;
}

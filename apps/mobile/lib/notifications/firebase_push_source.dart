import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';
import 'notification_event.dart';
import 'notification_presenter.dart';
import 'push_service.dart';

/// Firebase-backed token source. Call [initializeFirebasePushIfConfigured]
/// before constructing it.
class FirebasePushTokenSource implements PushTokenSource {
  FirebasePushTokenSource([FirebaseMessaging? messaging])
    : _messaging = messaging ?? FirebaseMessaging.instance;

  final FirebaseMessaging _messaging;

  PushPermission _permission(NotificationSettings settings) =>
      switch (settings.authorizationStatus) {
        AuthorizationStatus.authorized => PushPermission.granted,
        AuthorizationStatus.provisional => PushPermission.provisional,
        _ => PushPermission.denied,
      };

  @override
  Future<PushPermission> currentPermission() async =>
      _permission(await _messaging.getNotificationSettings());

  @override
  Future<PushPermission> requestPermission() async =>
      _permission(await _messaging.requestPermission());

  @override
  Future<String?> currentToken() async {
    await _messaging.setAutoInitEnabled(true);
    return _messaging.getToken();
  }

  @override
  Stream<String> get tokenRefreshes => _messaging.onTokenRefresh;

  @override
  Future<void> invalidateLocalToken() async {
    await _messaging.deleteToken();
    await _messaging.setAutoInitEnabled(false);
  }
}

/// Owns remote callbacks. Foreground remote presentation is suppressed and
/// replaced by exactly one local banner after strict envelope decoding.
class FirebasePushLifecycle {
  FirebasePushLifecycle({
    required this.presenter,
    required this.onForegroundEvent,
    required this.onNotificationTap,
  });

  final NotificationPresenter presenter;
  final FutureOr<bool> Function(NotificationEvent event) onForegroundEvent;
  FutureOr<void> Function(NotificationEvent event) onNotificationTap;
  StreamSubscription<RemoteMessage>? _foreground;
  StreamSubscription<RemoteMessage>? _opened;
  bool _enabled = false;
  bool _initialMessageRead = false;
  NotificationEvent? _pendingTap;
  int _epoch = 0;

  void setNotificationTapHandler(
    FutureOr<void> Function(NotificationEvent event) handler,
  ) {
    onNotificationTap = handler;
  }

  Future<void> start() async {
    await presenter.initialize(_handleLocalTap);
    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
          alert: false,
          badge: false,
          sound: false,
        );
    _foreground ??= FirebaseMessaging.onMessage.listen(_handleForeground);
    _opened ??= FirebaseMessaging.onMessageOpenedApp.listen(_handleRemoteTap);
    if (!_initialMessageRead) {
      _initialMessageRead = true;
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) await _handleRemoteTap(initial);
    }
  }

  void enable() {
    _enabled = true;
    _epoch++;
    final pending = _pendingTap;
    _pendingTap = null;
    if (pending != null) {
      unawaited(Future<void>.sync(() => onNotificationTap(pending)));
    }
  }

  Future<void> disableAndClear() async {
    _enabled = false;
    _pendingTap = null;
    _epoch++;
    await presenter.clear();
  }

  Future<void> stop() async {
    await disableAndClear();
    await _foreground?.cancel();
    await _opened?.cancel();
    _foreground = null;
    _opened = null;
  }

  Future<void> _handleForeground(RemoteMessage message) => handleForeground(
    data: message.data,
    title: message.notification?.title,
    body: message.notification?.body,
  );

  @visibleForTesting
  Future<void> handleForeground({
    required Map<String, Object?> data,
    required String? title,
    required String? body,
  }) async {
    if (!_enabled) return;
    final epoch = _epoch;
    final event = NotificationEvent.decode(data);
    if (event == null || title == null || body == null) return;
    final authorized = await onForegroundEvent(event);
    if (!authorized || !_enabled || epoch != _epoch) return;
    await presenter.show(event: event, title: title, body: body);
  }

  Future<void> _handleRemoteTap(RemoteMessage message) async {
    final event = NotificationEvent.decode(message.data);
    if (event == null) return;
    if (!_enabled) {
      _pendingTap = event;
      return;
    }
    await onNotificationTap(event);
  }

  Future<void> _handleLocalTap(NotificationEvent event) async {
    if (!_enabled) {
      _pendingTap = event;
      return;
    }
    await onNotificationTap(event);
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

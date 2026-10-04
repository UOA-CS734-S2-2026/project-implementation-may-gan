import 'dart:async';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'notification_event.dart';

abstract interface class NotificationPresenter {
  Future<void> initialize(
    FutureOr<void> Function(NotificationEvent event) onTap,
  );
  Future<void> show({
    required NotificationEvent event,
    required String title,
    required String body,
  });
  Future<void> clear();
}

/// Presents foreground notifications only. Background and terminated remote
/// notifications remain the provider's responsibility, preventing duplicates.
class LocalNotificationPresenter implements NotificationPresenter {
  LocalNotificationPresenter([FlutterLocalNotificationsPlugin? plugin])
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  static const _channel = AndroidNotificationDetails(
    'dayli_notifications',
    'Dayli notifications',
    channelDescription: 'Messages, friend requests, and daily reminders',
    importance: Importance.high,
    priority: Priority.high,
  );

  final FlutterLocalNotificationsPlugin _plugin;

  @override
  Future<void> initialize(
    FutureOr<void> Function(NotificationEvent event) onTap,
  ) async {
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: (response) {
        final event = NotificationEvent.decodeRoutingPayload(response.payload);
        if (event != null) unawaited(Future<void>.sync(() => onTap(event)));
      },
    );
    final launch = await _plugin.getNotificationAppLaunchDetails();
    final event = NotificationEvent.decodeRoutingPayload(
      launch?.notificationResponse?.payload,
    );
    if (launch?.didNotificationLaunchApp == true && event != null) {
      await onTap(event);
    }
  }

  @override
  Future<void> show({
    required NotificationEvent event,
    required String title,
    required String body,
  }) => _plugin.show(
    id: event.eventId.hashCode & 0x7fffffff,
    title: title,
    body: body,
    notificationDetails: const NotificationDetails(
      android: _channel,
      iOS: DarwinNotificationDetails(),
    ),
    payload: event.encodeRoutingPayload(),
  );

  @override
  Future<void> clear() => _plugin.cancelAll();
}

class NoopNotificationPresenter implements NotificationPresenter {
  const NoopNotificationPresenter();

  @override
  Future<void> initialize(
    FutureOr<void> Function(NotificationEvent event) onTap,
  ) async {}

  @override
  Future<void> show({
    required NotificationEvent event,
    required String title,
    required String body,
  }) async {}

  @override
  Future<void> clear() async {}
}

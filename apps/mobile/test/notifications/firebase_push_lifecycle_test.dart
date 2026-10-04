import 'dart:async';

import 'package:dayli_mobile/notifications/firebase_push_source.dart';
import 'package:dayli_mobile/notifications/notification_event.dart';
import 'package:dayli_mobile/notifications/notification_presenter.dart';
import 'package:flutter_test/flutter_test.dart';

class _Presenter implements NotificationPresenter {
  final shown = <NotificationEvent>[];
  int clears = 0;

  @override
  Future<void> initialize(
    FutureOr<void> Function(NotificationEvent event) onTap,
  ) async {}

  @override
  Future<void> show({
    required NotificationEvent event,
    required String title,
    required String body,
  }) async => shown.add(event);

  @override
  Future<void> clear() async => clears++;
}

Map<String, Object?> get _payload => {
  'version': '1',
  'eventId': 'event-1',
  'type': 'direct_message',
  'targetType': 'conversation',
  'targetId': 'conversation-1',
};

void main() {
  test('presents exactly once after current authorization succeeds', () async {
    final presenter = _Presenter();
    var authorizations = 0;
    final lifecycle = FirebasePushLifecycle(
      presenter: presenter,
      onForegroundEvent: (_) async {
        authorizations++;
        return true;
      },
      onNotificationTap: (_) {},
    )..enable();

    await lifecycle.handleForeground(
      data: _payload,
      title: 'Sender',
      body: 'Current message',
    );

    expect(authorizations, 1);
    expect(presenter.shown, hasLength(1));
  });

  test('malformed and unauthorized foreground events show no banner', () async {
    final presenter = _Presenter();
    final lifecycle = FirebasePushLifecycle(
      presenter: presenter,
      onForegroundEvent: (_) => false,
      onNotificationTap: (_) {},
    )..enable();

    await lifecycle.handleForeground(
      data: _payload,
      title: 'Sender',
      body: 'Stale message',
    );
    await lifecycle.handleForeground(
      data: {'version': '99'},
      title: 'Sender',
      body: 'Unknown message',
    );

    expect(presenter.shown, isEmpty);
  });

  test(
    'account cleanup during preflight suppresses and clears banners',
    () async {
      final presenter = _Presenter();
      final authorization = Completer<bool>();
      final lifecycle = FirebasePushLifecycle(
        presenter: presenter,
        onForegroundEvent: (_) => authorization.future,
        onNotificationTap: (_) {},
      )..enable();

      final handling = lifecycle.handleForeground(
        data: _payload,
        title: 'Old account',
        body: 'Private message',
      );
      await Future<void>.delayed(Duration.zero);
      await lifecycle.disableAndClear();
      authorization.complete(true);
      await handling;

      expect(presenter.clears, 1);
      expect(presenter.shown, isEmpty);
    },
  );
}

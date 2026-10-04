import 'package:dayli_mobile/notifications/notification_event.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Map<String, Object?> payload({
    String version = '1',
    String type = 'direct_message',
    String targetType = 'conversation',
    String targetId = 'target-1',
  }) => {
    'version': version,
    'eventId': 'event-1',
    'type': type,
    'targetType': targetType,
    'targetId': targetId,
  };

  test('decodes every approved version 1 category', () {
    expect(
      NotificationEvent.decode(payload())?.kind,
      NotificationKind.directMessage,
    );
    expect(
      NotificationEvent.decode(
        payload(type: 'friend_request', targetType: 'friend_request'),
      )?.kind,
      NotificationKind.friendRequest,
    );
    expect(
      NotificationEvent.decode(
        payload(type: 'final_hour_reminder', targetType: 'posting_day'),
      )?.kind,
      NotificationKind.finalHourReminder,
    );
    expect(
      NotificationEvent.decode(
        payload(type: 'friends_post_release', targetType: 'friends_feed'),
      )?.kind,
      NotificationKind.friendsPostRelease,
    );
  });

  test('rejects legacy, future, malformed, and arbitrary URL payloads', () {
    expect(NotificationEvent.decode({'conversationId': 'legacy'}), isNull);
    expect(NotificationEvent.decode(payload(version: '2')), isNull);
    expect(
      NotificationEvent.decode(payload(type: 'unknown', targetType: 'url')),
      isNull,
    );
    expect(
      NotificationEvent.decode(payload(targetId: 'https://evil.test/a')),
      isNull,
    );
    expect(NotificationEvent.decode(payload(targetId: '')), isNull);
  });

  test('local tap payload contains routing metadata but no preview', () {
    const event = NotificationEvent(
      eventId: 'event-1',
      kind: NotificationKind.directMessage,
      targetId: 'conversation-1',
    );
    final encoded = event.encodeRoutingPayload();
    expect(encoded, isNot(contains('title')));
    expect(encoded, isNot(contains('body')));
    expect(
      NotificationEvent.decodeRoutingPayload(encoded)?.targetId,
      'conversation-1',
    );
    expect(NotificationEvent.decodeRoutingPayload('{broken'), isNull);
  });
}

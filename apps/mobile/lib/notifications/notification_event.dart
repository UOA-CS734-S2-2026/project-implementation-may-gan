import 'dart:convert';

enum NotificationKind {
  directMessage,
  friendRequest,
  finalHourReminder,
  friendsPostRelease,
}

/// A versioned, non-preview routing hint. Provider data remains untrusted until
/// [NotificationRouter] performs an authenticated destination read.
class NotificationEvent {
  const NotificationEvent({
    required this.eventId,
    required this.kind,
    required this.targetId,
  });

  static const schemaVersion = 1;
  static final _identifier = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$');

  final String eventId;
  final NotificationKind kind;
  final String targetId;

  static NotificationEvent? decode(Map<String, Object?> data) {
    if (data['version'] != '$schemaVersion') return null;
    final eventId = data['eventId'];
    final type = data['type'];
    final targetType = data['targetType'];
    final targetId = data['targetId'];
    if (eventId is! String ||
        type is! String ||
        targetType is! String ||
        targetId is! String ||
        !_identifier.hasMatch(eventId) ||
        !_identifier.hasMatch(targetId)) {
      return null;
    }
    final kind = switch ((type, targetType)) {
      ('direct_message', 'conversation') => NotificationKind.directMessage,
      ('friend_request', 'friend_request') => NotificationKind.friendRequest,
      ('final_hour_reminder', 'posting_day') =>
        NotificationKind.finalHourReminder,
      ('friends_post_release', 'friends_feed') =>
        NotificationKind.friendsPostRelease,
      _ => null,
    };
    return kind == null
        ? null
        : NotificationEvent(eventId: eventId, kind: kind, targetId: targetId);
  }

  String encodeRoutingPayload() => jsonEncode({
    'version': '$schemaVersion',
    'eventId': eventId,
    'type': switch (kind) {
      NotificationKind.directMessage => 'direct_message',
      NotificationKind.friendRequest => 'friend_request',
      NotificationKind.finalHourReminder => 'final_hour_reminder',
      NotificationKind.friendsPostRelease => 'friends_post_release',
    },
    'targetType': switch (kind) {
      NotificationKind.directMessage => 'conversation',
      NotificationKind.friendRequest => 'friend_request',
      NotificationKind.finalHourReminder => 'posting_day',
      NotificationKind.friendsPostRelease => 'friends_feed',
    },
    'targetId': targetId,
  });

  static NotificationEvent? decodeRoutingPayload(String? payload) {
    if (payload == null) return null;
    try {
      final value = jsonDecode(payload);
      return value is Map<String, dynamic> ? decode(value) : null;
    } on FormatException {
      return null;
    }
  }
}

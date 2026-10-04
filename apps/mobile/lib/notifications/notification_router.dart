import '../api/api_failure.dart';
import '../api/feed_client.dart';
import '../api/friends_client.dart';
import '../api/posting_day_client.dart';
import '../auth/session_controller.dart';
import '../messaging/messaging_client.dart';
import 'notification_event.dart';

abstract interface class NotificationPreflight {
  /// Revalidates the target under the current bearer without retaining preview
  /// content. Foreground presentation and tap routing share this check.
  Future<bool> authorize(NotificationEvent event);

  /// Returns the safe destination, or a non-private fallback route.
  Future<String> destination(NotificationEvent event);
}

class ApiNotificationPreflight implements NotificationPreflight {
  ApiNotificationPreflight({
    required this.messaging,
    required this.friends,
    required this.postingDays,
    required this.feed,
  });

  final MessagingClient messaging;
  final FriendsClient friends;
  final PostingDayClient postingDays;
  final FeedClient feed;

  @override
  Future<bool> authorize(NotificationEvent event) async {
    switch (event.kind) {
      case NotificationKind.directMessage:
        return await messaging.conversation(event.targetId)
            is ApiSuccess<MessagingConversation>;
      case NotificationKind.friendRequest:
        String? cursor;
        do {
          final result = await friends.loadRequests('incoming', cursor: cursor);
          if (result is! ApiSuccess<FriendRequestPage>) return false;
          if (result.value.items.any((item) => item.id == event.targetId)) {
            return true;
          }
          cursor = result.value.hasMore ? result.value.nextCursor : null;
        } while (cursor != null);
        return false;
      case NotificationKind.finalHourReminder:
        final result = await postingDays.current();
        return switch (result) {
          ApiSuccess<PostingDay>(:final value)
              when value.localDate == event.targetId && !value.hasPosted =>
            true,
          _ => false,
        };
      case NotificationKind.friendsPostRelease:
        // The current feed read is the authorization check. Its result is not
        // retained here, so notification routing never caches post content.
        return await feed.page() is ApiSuccess<FeedPage>;
    }
  }

  @override
  Future<String> destination(NotificationEvent event) async {
    final authorized = await authorize(event);
    return switch (event.kind) {
      NotificationKind.directMessage =>
        authorized
            ? '/messages/${Uri.encodeComponent(event.targetId)}'
            : '/messages',
      NotificationKind.friendRequest => '/friends',
      NotificationKind.finalHourReminder => authorized ? '/post' : '/',
      NotificationKind.friendsPostRelease => '/',
    };
  }
}

/// Defers untrusted notification navigation until a current signed-in actor
/// completes an authorized destination read.
class NotificationRouter {
  NotificationRouter({
    required this.session,
    required this.preflight,
    required this.go,
  }) : _lastUserId = session.user?.id {
    session.addListener(_sessionChanged);
  }

  final SessionController session;
  final NotificationPreflight preflight;
  final void Function(String location) go;
  NotificationEvent? _pending;
  String? _lastUserId;
  int _operation = 0;
  bool _routing = false;

  void route(NotificationEvent event) {
    _pending = event;
    _operation++;
    _flushWhenAuthenticated();
  }

  void dispose() {
    _operation++;
    _pending = null;
    session.removeListener(_sessionChanged);
  }

  void _sessionChanged() {
    final userId = session.user?.id;
    if (_lastUserId != null && userId != _lastUserId) {
      _pending = null;
      _operation++;
    }
    _lastUserId = userId;
    _flushWhenAuthenticated();
  }

  void _flushWhenAuthenticated() {
    if (_routing ||
        session.status != SessionStatus.signedIn ||
        session.user == null ||
        _pending == null) {
      return;
    }
    final event = _pending!;
    _pending = null;
    final operation = _operation;
    final generation = session.generation;
    final userId = session.user!.id;
    _routing = true;
    _routeCurrent(event, operation, generation, userId);
  }

  Future<void> _routeCurrent(
    NotificationEvent event,
    int operation,
    int generation,
    String userId,
  ) async {
    try {
      final destination = await preflight.destination(event);
      if (operation == _operation &&
          generation == session.generation &&
          session.status == SessionStatus.signedIn &&
          session.user?.id == userId) {
        go(destination);
      }
    } catch (_) {
      // Network and decoder failures disclose nothing and do not navigate.
    } finally {
      _routing = false;
      if (_pending != null) _flushWhenAuthenticated();
    }
  }
}

import '../auth/session_controller.dart';

/// Defers untrusted notification navigation until a signed-in session exists.
class NotificationRouter {
  NotificationRouter({required this.session, required this.go}) {
    session.addListener(_flushWhenAuthenticated);
  }

  final SessionController session;
  final void Function(String location) go;
  String? _pendingConversationId;

  void routeConversation(String conversationId) {
    if (session.status == SessionStatus.signedIn) {
      go('/messages/${Uri.encodeComponent(conversationId)}');
    } else {
      _pendingConversationId = conversationId;
    }
  }

  void dispose() => session.removeListener(_flushWhenAuthenticated);

  void _flushWhenAuthenticated() {
    if (session.status != SessionStatus.signedIn ||
        _pendingConversationId == null) {
      return;
    }
    final conversationId = _pendingConversationId!;
    _pendingConversationId = null;
    go('/messages/${Uri.encodeComponent(conversationId)}');
  }
}

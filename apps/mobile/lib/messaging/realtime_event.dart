import 'dart:convert';

sealed class RealtimeEvent {
  const RealtimeEvent();
  factory RealtimeEvent.decode(String frame) {
    final decoded = jsonDecode(frame);
    if (decoded is! Map<String, dynamic> ||
        decoded['version'] != 1 ||
        decoded['type'] is! String) {
      throw const FormatException('Unsupported realtime event.');
    }
    switch (decoded['type']) {
      case 'ready':
        if (decoded['expiresAt'] is! String) {
          throw const FormatException('Invalid ready event.');
        }
        return RealtimeReady(DateTime.parse(decoded['expiresAt'] as String));
      case 'conversation.changed':
        if (decoded['eventId'] is! String ||
            decoded['conversationId'] is! String ||
            decoded['changeSequence'] is! String ||
            !RegExp(r'^\d+$').hasMatch(decoded['changeSequence'] as String)) {
          throw const FormatException('Invalid conversation event.');
        }
        return ConversationChanged(
          decoded['eventId'] as String,
          decoded['conversationId'] as String,
          decoded['changeSequence'] as String,
        );
      default:
        throw const FormatException('Unsupported realtime event.');
    }
  }
}

class RealtimeReady extends RealtimeEvent {
  const RealtimeReady(this.expiresAt);
  final DateTime expiresAt;
}

class ConversationChanged extends RealtimeEvent {
  const ConversationChanged(
    this.eventId,
    this.conversationId,
    this.changeSequence,
  );
  final String eventId;
  final String conversationId;
  final String changeSequence;
}

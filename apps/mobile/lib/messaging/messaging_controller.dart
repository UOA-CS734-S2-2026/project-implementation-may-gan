import 'package:flutter/foundation.dart';

import '../api/api_failure.dart';
import 'messaging_client.dart';

/// Session-scoped foreground state. It only fetches from explicit lifecycle
/// actions, never from a periodic timer or background polling fallback.
class MessagingController extends ChangeNotifier {
  MessagingController(this._client);

  final MessagingClient _client;
  List<MessagingConversation> _inbox = const [];
  final Map<String, List<MessagingMessage>> _threads = {};
  ApiFailure? _failure;
  bool _loading = false;
  int _generation = 0;

  List<MessagingConversation> get inbox => List.unmodifiable(_inbox);
  ApiFailure? get failure => _failure;
  bool get loading => _loading;
  List<MessagingMessage> thread(String conversationId) =>
      List.unmodifiable(_threads[conversationId] ?? const []);

  Future<void> refreshInbox() async {
    final generation = _generation;
    _loading = true;
    notifyListeners();
    final result = await _client.inbox();
    if (generation != _generation) return;
    _loading = false;
    switch (result) {
      case ApiSuccess<List<MessagingConversation>>(:final value):
        _inbox = value;
        _failure = null;
      case ApiError<List<MessagingConversation>>(:final failure):
        _failure = failure;
    }
    notifyListeners();
  }

  Future<void> loadConversation(String conversationId) async {
    final generation = _generation;
    final result = await _client.messages(conversationId);
    if (generation != _generation) return;
    switch (result) {
      case ApiSuccess<List<MessagingMessage>>(:final value):
        _threads[conversationId] = _merge(
          _threads[conversationId] ?? const [],
          value,
        );
        _failure = null;
      case ApiError<List<MessagingMessage>>(:final failure):
        _failure = failure;
    }
    notifyListeners();
  }

  Future<bool> send(
    String conversationId,
    String text, {
    required String clientMessageId,
  }) async {
    if (text.trim().isEmpty) return false;
    final generation = _generation;
    final result = await _client.send(
      conversationId: conversationId,
      clientMessageId: clientMessageId,
      text: text,
    );
    if (generation != _generation) return false;
    switch (result) {
      case ApiSuccess<MessagingMessage>(:final value):
        _threads[conversationId] = _merge(
          _threads[conversationId] ?? const [],
          [value],
        );
        _failure = null;
      case ApiError<MessagingMessage>(:final failure):
        _failure = failure;
    }
    notifyListeners();
    return result is ApiSuccess<MessagingMessage>;
  }

  /// Called by session teardown before another user can see cached data.
  void clear() {
    _generation++;
    _inbox = const [];
    _threads.clear();
    _failure = null;
    _loading = false;
    notifyListeners();
  }

  static List<MessagingMessage> _merge(
    List<MessagingMessage> current,
    List<MessagingMessage> incoming,
  ) {
    final byId = {for (final item in current) item.id: item};
    for (final item in incoming) {
      final old = byId[item.id];
      if (old == null || item.version >= old.version) byId[item.id] = item;
    }
    final merged = byId.values.toList()
      ..sort(
        (a, b) => BigInt.parse(a.sequence).compareTo(BigInt.parse(b.sequence)),
      );
    return merged;
  }
}

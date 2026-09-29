import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api/api_failure.dart';
import 'messaging_client.dart';
import 'realtime_client.dart';
import 'realtime_event.dart';

/// Session-scoped messaging state. Network work only happens for explicit UI,
/// lifecycle, and socket reconciliation actions. It never polls on a timer.
class MessagingController extends ChangeNotifier {
  MessagingController(this._client);

  final MessagingClient _client;
  List<MessagingConversation> _inbox = const [];
  List<MessagingConversation> _requests = const [];
  final Map<String, MessagingConversation> _conversations = {};
  final Map<String, List<MessagingMessage>> _threads = {};
  final Map<String, bool> _hasOlder = {};
  final Map<String, String?> _olderCursor = {};
  ApiFailure? _failure;
  bool _loading = false;
  int _inboxUnread = 0;
  int _requestUnread = 0;
  int _generation = 0;
  RealtimeConnection? _realtime;
  final Set<String> _eventIds = <String>{};
  final Map<String, String> _lastChangeSequence = <String, String>{};

  List<MessagingConversation> get inbox => List.unmodifiable(_inbox);
  List<MessagingConversation> get requests => List.unmodifiable(_requests);
  int get inboxUnread => _inboxUnread;
  int get requestUnread => _requestUnread;
  int get unreadTotal => _inboxUnread + _requestUnread;
  ApiFailure? get failure => _failure;
  bool get loading => _loading;
  MessagingConversation? conversation(String id) => _conversations[id];
  List<MessagingMessage> thread(String conversationId) =>
      List.unmodifiable(_threads[conversationId] ?? const []);
  bool hasOlder(String conversationId) => _hasOlder[conversationId] ?? false;

  void enableRealtime() {
    _realtime ??= MessagingRealtimeClient(
      _client,
      onReady: _realtimeReady,
      onChange: _realtimeChange,
    );
  }

  Future<void> startRealtime() async {
    enableRealtime();
    await _realtime!.start();
  }

  Future<void> resumeRealtime() async => _realtime?.resume();

  /// Refresh foreground state when the operating system resumes this app.
  Future<void> foreground() async {
    await resumeRealtime();
    await refreshInbox();
    final generation = _generation;
    for (final id in _threads.keys.toList()) {
      if (generation != _generation) return;
      await loadConversation(id);
    }
  }

  Future<void> stopRealtime() async => _realtime?.stop();

  Future<void> _realtimeReady() async {
    final generation = _generation;
    await refreshInbox();
    for (final conversationId in _threads.keys.toList()) {
      if (generation != _generation) return;
      await loadConversation(conversationId);
      if (generation != _generation) return;
      final highWatermark = _conversations[conversationId]?.lastChangeSequence;
      if (highWatermark != null) {
        await _realtimeChange(
          ConversationChanged(
            'ready-$generation-$conversationId-$highWatermark',
            conversationId,
            highWatermark,
          ),
        );
      }
    }
  }

  /// Called by the session socket after ready and during durable replay.
  Future<void> reconcileRealtimeEvent(ConversationChanged event) =>
      _realtimeChange(event);

  Future<void> _realtimeChange(ConversationChanged event) async {
    final generation = _generation;
    if (_eventIds.contains(event.eventId)) return;
    final previous = _lastChangeSequence[event.conversationId];
    if (previous != null && _sequenceAtMost(event.changeSequence, previous)) {
      return;
    }
    _eventIds.add(event.eventId);
    if (_eventIds.length > 512) _eventIds.remove(_eventIds.first);

    var cursor = previous ?? '0';
    while (true) {
      final page = await _client.changes(
        event.conversationId,
        afterChangeSequence: cursor,
      );
      if (generation != _generation) return;
      if (page is ApiError<MessagingChangePage>) {
        // Do not poison durable recovery with a transient failed event.
        _eventIds.remove(event.eventId);
        _failure = page.failure;
        notifyListeners();
        return;
      }
      final value = (page as ApiSuccess<MessagingChangePage>).value;
      for (final change in value.items) {
        if (change.messageId == null) continue;
        final message = await _client.message(
          event.conversationId,
          change.messageId!,
        );
        if (generation != _generation) return;
        if (message case ApiSuccess<MessagingMessage>(:final value)) {
          _applyMessages(event.conversationId, [value]);
        } else {
          // Do not advance beyond a missing edit, reaction, or tombstone.
          // A later socket event or reconnect retries this same durable range.
          _eventIds.remove(event.eventId);
          _failure = (message as ApiError<MessagingMessage>).failure;
          notifyListeners();
          return;
        }
      }
      // Cursors only move after every page projection is applied.
      cursor = value.nextChangeSequence ?? value.highWatermark;
      _lastChangeSequence[event.conversationId] = cursor;
      if (!value.hasMore) break;
    }
    if (generation != _generation) return;
    await _refreshConversation(event.conversationId, generation);
    if (generation != _generation) return;
    await refreshInbox();
  }

  Future<void> refreshInbox() async {
    final generation = _generation;
    _loading = true;
    notifyListeners();
    final inbox = await _client.inbox();
    if (generation != _generation) return;
    final requests = await _client.inbox(folder: 'requests');
    if (generation != _generation) return;
    if (inbox case ApiSuccess<List<MessagingConversation>>(:final value)) {
      _inbox = value;
      for (final item in value) {
        _conversations[item.id] = item;
      }
    }
    if (requests case ApiSuccess<List<MessagingConversation>>(:final value)) {
      _requests = value;
      for (final item in value) {
        _conversations[item.id] = item;
      }
    }
    _inboxUnread = _inbox.fold(0, (sum, item) => sum + item.unreadCount);
    _requestUnread = _requests.fold(0, (sum, item) => sum + item.unreadCount);
    _loading = false;
    final failure = inbox is ApiError<List<MessagingConversation>>
        ? inbox.failure
        : requests is ApiError<List<MessagingConversation>>
        ? requests.failure
        : null;
    _failure = failure;
    notifyListeners();
  }

  Future<void> loadConversation(String conversationId) async {
    final generation = _generation;
    await _refreshConversation(conversationId, generation);
    if (generation != _generation) return;
    final result = await _client.messages(conversationId);
    if (generation != _generation) return;
    switch (result) {
      case ApiSuccess<MessagingPage>(:final value):
        _applyMessages(conversationId, value.items);
        _hasOlder[conversationId] = value.hasMore;
        _olderCursor[conversationId] = value.nextCursor;
        _failure = null;
      case ApiError<MessagingPage>(:final failure):
        _failure = failure;
    }
    notifyListeners();
  }

  Future<void> loadOlder(String conversationId) async {
    if (!hasOlder(conversationId)) return;
    final generation = _generation;
    final before =
        _olderCursor[conversationId] ??
        (_threads[conversationId]?.isEmpty ?? true
            ? null
            : _threads[conversationId]!.first.sequence);
    if (before == null) return;
    final result = await _client.messages(
      conversationId,
      beforeSequence: before,
    );
    if (generation != _generation) return;
    switch (result) {
      case ApiSuccess<MessagingPage>(:final value):
        _applyMessages(conversationId, value.items);
        _hasOlder[conversationId] = value.hasMore;
        _olderCursor[conversationId] = value.nextCursor;
        _failure = null;
      case ApiError<MessagingPage>(:final failure):
        _failure = failure;
    }
    notifyListeners();
  }

  Future<ApiResult<String?>> findDirect(String recipientId) async {
    final generation = _generation;
    if (_client is! HttpMessagingClient) {
      return const ApiError(ServiceUnavailable());
    }
    final result = await _client.findDirect(recipientId);
    if (generation != _generation) return const ApiError(Unauthenticated());
    return result;
  }

  Future<String?> createDirect(
    String recipientId,
    String text, {
    required String clientMessageId,
  }) async {
    if (recipientId.trim().isEmpty || text.trim().isEmpty) return null;
    final generation = _generation;
    final result = await _client.createDirect(
      recipientId: recipientId,
      clientMessageId: clientMessageId,
      text: text,
    );
    if (generation != _generation) return null;
    switch (result) {
      case ApiSuccess<DirectConversationResult>(:final value):
        _applyMessages(value.conversationId, [value.message]);
        _failure = null;
        unawaited(_refreshInboxAfterAction(generation));
        notifyListeners();
        return value.conversationId;
      case ApiError<DirectConversationResult>(:final failure):
        _failure = failure;
        notifyListeners();
        return null;
    }
  }

  Future<bool> resolveRequest(String conversationId, String decision) async {
    final generation = _generation;
    final result = await _client.resolveRequest(conversationId, decision);
    if (generation != _generation) return false;
    switch (result) {
      case ApiSuccess<MessagingConversation>(:final value):
        _conversations[conversationId] = value;
        _failure = null;
        unawaited(_refreshInboxAfterAction(generation));
        notifyListeners();
        return true;
      case ApiError<MessagingConversation>(:final failure):
        _failure = failure;
        notifyListeners();
        return false;
    }
  }

  Future<bool> markRead(String conversationId, String throughSequence) async {
    final generation = _generation;
    final result = await _client.markRead(conversationId, throughSequence);
    if (generation != _generation) return false;
    switch (result) {
      case ApiSuccess<MarkReadResult>(:final value):
        final conversation = _conversations[conversationId];
        if (conversation != null) {
          _conversations[conversationId] = MessagingConversation(
            id: conversation.id,
            peerId: conversation.peerId,
            peerName: conversation.peerName,
            requestState: conversation.requestState,
            unreadCount: value.unreadCount,
            latestMessage: conversation.latestMessage,
            lastMessageSequence: conversation.lastMessageSequence,
            lastChangeSequence: conversation.lastChangeSequence,
            lastReadSequence: value.lastReadSequence,
            receiptSequence: value.receiptSequence,
            canSend: conversation.canSend,
            canResolveRequest: conversation.canResolveRequest,
          );
          _replaceConversation(_conversations[conversationId]!);
        }
        _failure = null;
        notifyListeners();
        return true;
      case ApiError<MarkReadResult>(:final failure):
        _failure = failure;
        notifyListeners();
        return false;
    }
  }

  Future<bool> send(
    String conversationId,
    String text, {
    required String clientMessageId,
    String? replyToMessageId,
  }) => _messageMutation(
    conversationId,
    () => _client.send(
      conversationId: conversationId,
      clientMessageId: clientMessageId,
      text: text,
      replyToMessageId: replyToMessageId,
    ),
  );

  Future<bool> edit(
    String conversationId,
    MessagingMessage message,
    String text,
  ) => _messageMutation(
    conversationId,
    () => _client.edit(
      conversationId: conversationId,
      messageId: message.id,
      text: text,
      expectedVersion: message.version,
    ),
  );

  Future<bool> unsend(String conversationId, MessagingMessage message) =>
      _messageMutation(
        conversationId,
        () => _client.unsend(conversationId, message.id),
      );

  Future<bool> setReaction(
    String conversationId,
    MessagingMessage message,
    String reaction,
  ) => _messageMutation(
    conversationId,
    () => _client.setReaction(conversationId, message.id, reaction),
  );

  Future<bool> removeReaction(
    String conversationId,
    MessagingMessage message,
  ) => _messageMutation(
    conversationId,
    () => _client.removeReaction(conversationId, message.id),
  );

  Future<bool> _messageMutation(
    String conversationId,
    Future<ApiResult<MessagingMessage>> Function() action,
  ) async {
    final generation = _generation;
    final result = await action();
    if (generation != _generation) return false;
    switch (result) {
      case ApiSuccess<MessagingMessage>(:final value):
        _applyMessages(conversationId, [value]);
        _failure = null;
        unawaited(_refreshInboxAfterAction(generation));
        notifyListeners();
        return true;
      case ApiError<MessagingMessage>(:final failure):
        _failure = failure;
        notifyListeners();
        return false;
    }
  }

  Future<void> _refreshInboxAfterAction(int generation) async {
    await refreshInbox();
    if (generation != _generation) return;
  }

  Future<void> _refreshConversation(String id, int generation) async {
    final result = await _client.conversation(id);
    if (generation != _generation) return;
    switch (result) {
      case ApiSuccess<MessagingConversation>(:final value):
        _conversations[id] = value;
        _replaceConversation(value);
        _failure = null;
      case ApiError<MessagingConversation>(:final failure):
        _failure = failure;
    }
    notifyListeners();
  }

  void _replaceConversation(MessagingConversation replacement) {
    _inbox = _inbox
        .map((item) => item.id == replacement.id ? replacement : item)
        .toList();
    _requests = _requests
        .map((item) => item.id == replacement.id ? replacement : item)
        .toList();
    _inboxUnread = _inbox.fold(0, (sum, item) => sum + item.unreadCount);
    _requestUnread = _requests.fold(0, (sum, item) => sum + item.unreadCount);
  }

  void _applyMessages(String conversationId, List<MessagingMessage> incoming) {
    final byId = {
      for (final item in _threads[conversationId] ?? const <MessagingMessage>[])
        item.id: item,
    };
    for (final item in incoming) {
      final old = byId[item.id];
      if (old == null || item.version >= old.version) byId[item.id] = item;
    }
    for (final parent in incoming) {
      for (final child in byId.values.toList()) {
        if (child.replyToMessageId != parent.id) continue;
        byId[child.id] = child.copyWith(
          replyPreview: MessageReplyPreview(
            id: parent.id,
            senderId: parent.senderId,
            text: parent.text,
            unsentAt: parent.unsentAt,
          ),
        );
      }
    }
    final merged = byId.values.toList()
      ..sort(
        (a, b) => BigInt.parse(a.sequence).compareTo(BigInt.parse(b.sequence)),
      );
    _threads[conversationId] = merged;
  }

  static bool _sequenceAtMost(String value, String maximum) =>
      BigInt.parse(value) <= BigInt.parse(maximum);

  /// Called before another account may see state. Async results from the old
  /// generation cannot write after this point.
  void clear() {
    _generation++;
    _inbox = const [];
    _requests = const [];
    _conversations.clear();
    _threads.clear();
    _hasOlder.clear();
    _olderCursor.clear();
    _eventIds.clear();
    _lastChangeSequence.clear();
    _inboxUnread = 0;
    _requestUnread = 0;
    unawaited(_realtime?.stop());
    _failure = null;
    _loading = false;
    notifyListeners();
  }
}

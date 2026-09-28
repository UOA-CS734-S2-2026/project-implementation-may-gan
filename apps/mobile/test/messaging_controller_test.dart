import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
import 'package:dayli_mobile/messaging/realtime_client.dart';
import 'package:dayli_mobile/messaging/realtime_event.dart';
import 'package:flutter_test/flutter_test.dart';

MessagingMessage testMessage({
  String id = 'm-1',
  String conversationId = 'c-1',
  String sequence = '1',
  String senderId = 'alice',
  String? text = 'hello',
  int version = 1,
  String? replyToMessageId,
  MessageReplyPreview? replyPreview,
  DateTime? unsentAt,
}) => MessagingMessage(
  id: id,
  conversationId: conversationId,
  sequence: sequence,
  senderId: senderId,
  clientMessageId: 'client-$id',
  text: text,
  replyToMessageId: replyToMessageId,
  replyPreview: replyPreview,
  version: version,
  createdAt: DateTime.utc(2026, 9, 28),
  editedAt: version > 1 ? DateTime.utc(2026, 9, 28, 1) : null,
  unsentAt: unsentAt,
  reactions: const [],
);

MessagingConversation testConversation({
  String id = 'c-1',
  String state = 'active',
  bool canSend = true,
  bool canResolve = false,
  String receipt = '0',
}) => MessagingConversation(
  id: id,
  peerId: 'bob',
  peerName: 'Bob',
  requestState: state,
  unreadCount: 1,
  latestMessage: testMessage(conversationId: id),
  lastMessageSequence: '3',
  lastChangeSequence: '3',
  lastReadSequence: '0',
  receiptSequence: receipt,
  canSend: canSend,
  canResolveRequest: canResolve,
);

class FakeMessagingClient implements MessagingClient {
  final conversations = <String, MessagingConversation>{
    'c-1': testConversation(),
  };
  final pages = <String, List<MessagingPage>>{
    'c-1': [
      MessagingPage(items: [testMessage()], nextCursor: null, hasMore: false),
    ],
  };
  final canonical = <String, MessagingMessage>{'m-1': testMessage()};
  final changesByConversation = <String, List<MessagingChangePage>>{};
  final calls = <String>[];
  Completer<ApiResult<MessagingPage>>? deferredMessages;

  @override
  Future<ApiResult<List<MessagingConversation>>> inbox({
    String folder = 'inbox',
  }) async {
    calls.add('inbox:$folder');
    return ApiSuccess(
      folder == 'requests'
          ? conversations.values
                .where((item) => item.requestState == 'pending')
                .toList()
          : conversations.values
                .where((item) => item.requestState != 'pending')
                .toList(),
    );
  }

  @override
  Future<ApiResult<MessagingConversation>> conversation(
    String conversationId,
  ) async => ApiSuccess(conversations[conversationId]!);

  @override
  Future<ApiResult<MessagingPage>> messages(
    String conversationId, {
    String? beforeSequence,
  }) {
    calls.add('messages:$conversationId:${beforeSequence ?? 'latest'}');
    if (deferredMessages != null) return deferredMessages!.future;
    final available = pages[conversationId] ?? const [];
    return Future.value(
      ApiSuccess(
        available.isEmpty
            ? const MessagingPage(items: [], nextCursor: null, hasMore: false)
            : available.removeAt(0),
      ),
    );
  }

  @override
  Future<ApiResult<MessagingMessage>> message(
    String conversationId,
    String messageId,
  ) async => ApiSuccess(canonical[messageId]!);

  @override
  Future<ApiResult<DirectConversationResult>> createDirect({
    required String recipientId,
    required String clientMessageId,
    required String text,
  }) async {
    calls.add('direct:$recipientId:$clientMessageId:$text');
    final result = testMessage(
      id: 'm-direct',
      conversationId: 'c-direct',
      text: text,
    );
    conversations['c-direct'] = testConversation(id: 'c-direct');
    return ApiSuccess(
      DirectConversationResult(conversationId: 'c-direct', message: result),
    );
  }

  @override
  Future<ApiResult<MessagingConversation>> resolveRequest(
    String conversationId,
    String decision,
  ) async {
    calls.add('resolve:$decision');
    final old = conversations[conversationId]!;
    final updated = MessagingConversation(
      id: old.id,
      peerId: old.peerId,
      peerName: old.peerName,
      requestState: decision == 'accept' ? 'active' : 'declined',
      unreadCount: old.unreadCount,
      latestMessage: old.latestMessage,
      lastMessageSequence: old.lastMessageSequence,
      lastChangeSequence: old.lastChangeSequence,
      lastReadSequence: old.lastReadSequence,
      receiptSequence: old.receiptSequence,
      canSend: decision == 'accept',
      canResolveRequest: false,
    );
    conversations[conversationId] = updated;
    return ApiSuccess(updated);
  }

  @override
  Future<ApiResult<MarkReadResult>> markRead(
    String conversationId,
    String throughSequence,
  ) async {
    calls.add('read:$throughSequence');
    return ApiSuccess(
      MarkReadResult(
        lastReadSequence: throughSequence,
        receiptSequence: throughSequence,
        unreadCount: 0,
      ),
    );
  }

  @override
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket() async =>
      const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  }) async {
    calls.add('changes:$afterChangeSequence');
    final values = changesByConversation[conversationId] ?? const [];
    return ApiSuccess(
      values.isEmpty
          ? const MessagingChangePage(
              items: [],
              highWatermark: '0',
              hasMore: false,
              nextChangeSequence: null,
            )
          : values.removeAt(0),
    );
  }

  @override
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
    String? replyToMessageId,
  }) async {
    calls.add('send:$clientMessageId:$replyToMessageId');
    return ApiSuccess(
      testMessage(
        id: 'm-send',
        conversationId: conversationId,
        sequence: '4',
        text: text,
        replyToMessageId: replyToMessageId,
      ),
    );
  }

  @override
  Future<ApiResult<MessagingMessage>> edit({
    required String conversationId,
    required String messageId,
    required String text,
    required int expectedVersion,
  }) async {
    calls.add('edit:$messageId:$expectedVersion');
    return ApiSuccess(
      testMessage(
        id: messageId,
        conversationId: conversationId,
        text: text,
        version: expectedVersion + 1,
      ),
    );
  }

  @override
  Future<ApiResult<MessagingMessage>> unsend(
    String conversationId,
    String messageId,
  ) async {
    calls.add('unsend:$messageId');
    return ApiSuccess(
      testMessage(
        id: messageId,
        conversationId: conversationId,
        text: null,
        version: 3,
        unsentAt: DateTime.utc(2026, 9, 28, 2),
      ),
    );
  }

  @override
  Future<ApiResult<MessagingMessage>> setReaction(
    String conversationId,
    String messageId,
    String reaction,
  ) async {
    calls.add('reaction:$reaction');
    return ApiSuccess(
      testMessage(id: messageId, conversationId: conversationId, version: 4),
    );
  }

  @override
  Future<ApiResult<MessagingMessage>> removeReaction(
    String conversationId,
    String messageId,
  ) async {
    calls.add('removeReaction:$messageId');
    return ApiSuccess(
      testMessage(id: messageId, conversationId: conversationId, version: 5),
    );
  }
}

void main() {
  test(
    'ignores a deferred prior-account history response after clear',
    () async {
      final client = FakeMessagingClient()..deferredMessages = Completer();
      final controller = MessagingController(client);
      final loading = controller.loadConversation('c-1');
      await Future<void>.delayed(Duration.zero);
      controller.clear();
      client.deferredMessages!.complete(
        ApiSuccess(
          MessagingPage(
            items: [testMessage()],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      );
      await loading;
      expect(controller.thread('c-1'), isEmpty);
      expect(controller.failure, isNull);
    },
  );

  test(
    'calls direct, request, read, reply, and rich message action APIs',
    () async {
      final client = FakeMessagingClient();
      client.conversations['c-request'] = testConversation(
        id: 'c-request',
        state: 'pending',
        canSend: false,
        canResolve: true,
      );
      final controller = MessagingController(client);
      await controller.refreshInbox();
      expect(controller.requests, hasLength(1));
      expect(
        await controller.createDirect(
          'known-profile',
          'first',
          clientMessageId: 'stable-direct',
        ),
        'c-direct',
      );
      expect(await controller.resolveRequest('c-request', 'accept'), isTrue);
      await controller.loadConversation('c-1');
      final original = controller.thread('c-1').single;
      expect(await controller.markRead('c-1', '1'), isTrue);
      expect(
        await controller.send(
          'c-1',
          'reply',
          clientMessageId: 'stable-retry',
          replyToMessageId: original.id,
        ),
        isTrue,
      );
      expect(await controller.edit('c-1', original, 'edited'), isTrue);
      expect(await controller.unsend('c-1', original), isTrue);
      expect(await controller.setReaction('c-1', original, 'love'), isTrue);
      expect(await controller.removeReaction('c-1', original), isTrue);
      expect(
        client.calls,
        containsAll([
          'direct:known-profile:stable-direct:first',
          'resolve:accept',
          'read:1',
          'send:stable-retry:m-1',
          'edit:m-1:1',
          'unsend:m-1',
          'reaction:love',
          'removeReaction:m-1',
        ]),
      );
    },
  );

  test(
    'merges older pages and refreshes an old unsent parent plus reply preview',
    () async {
      final parent = testMessage(id: 'm-old', sequence: '1', text: 'old text');
      final reply = testMessage(
        id: 'm-reply',
        sequence: '2',
        senderId: 'bob',
        replyToMessageId: parent.id,
        replyPreview: const MessageReplyPreview(
          id: 'm-old',
          senderId: 'alice',
          text: 'old text',
          unsentAt: null,
        ),
      );
      final client = FakeMessagingClient()
        ..pages['c-1'] = [
          MessagingPage(items: [reply], nextCursor: '1', hasMore: true),
          MessagingPage(items: [parent], nextCursor: null, hasMore: false),
        ]
        ..canonical['m-old'] = testMessage(
          id: 'm-old',
          sequence: '1',
          text: null,
          version: 2,
          unsentAt: DateTime.utc(2026, 9, 28, 2),
        )
        ..changesByConversation['c-1'] = [
          const MessagingChangePage(
            items: [MessagingChange(changeSequence: '4', messageId: 'm-old')],
            highWatermark: '4',
            hasMore: false,
            nextChangeSequence: null,
          ),
        ];
      final controller = MessagingController(client);
      await controller.loadConversation('c-1');
      await controller.loadOlder('c-1');
      await controller.reconcileRealtimeEvent(
        const ConversationChanged('event-old', 'c-1', '4'),
      );
      final messages = controller.thread('c-1');
      expect(messages, hasLength(2));
      expect(messages.first.text, isNull);
      expect(messages.last.replyPreview?.text, isNull);
      expect(messages.last.replyPreview?.unsentAt, isNotNull);
    },
  );

  test('requests a fresh ticket after a jittered reconnect delay', () async {
    final client = FakeMessagingClient();
    final reconnect = MessagingRealtimeClient(
      client,
      onReady: () async {},
      onChange: (_) async {},
      schedule: (_, callback) => Timer(Duration.zero, callback),
    );
    await reconnect.start();
    await Future<void>.delayed(const Duration(milliseconds: 1));
    await reconnect.stop();
  });
}

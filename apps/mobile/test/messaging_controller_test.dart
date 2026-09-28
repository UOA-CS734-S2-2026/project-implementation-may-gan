import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
import 'package:dayli_mobile/messaging/realtime_event.dart';
import 'package:dayli_mobile/messaging/realtime_client.dart';
import 'package:flutter_test/flutter_test.dart';

class DeferredMessagingClient implements MessagingClient {
  final inboxResult = Completer<ApiResult<List<MessagingConversation>>>();
  final messagesResult = Completer<ApiResult<List<MessagingMessage>>>();
  final sendResult = Completer<ApiResult<MessagingMessage>>();

  @override
  Future<ApiResult<List<MessagingConversation>>> inbox() => inboxResult.future;
  @override
  Future<ApiResult<List<MessagingMessage>>> messages(String conversationId) =>
      messagesResult.future;
  @override
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket() async =>
      const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  }) async => const ApiError(ServiceUnavailable());

  @override
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
  }) => sendResult.future;
}

MessagingMessage _message() => const MessagingMessage(
  id: 'm-alice',
  conversationId: 'c-alice',
  sequence: '1',
  senderId: 'alice',
  clientMessageId: 'client',
  text: 'Alice private text',
  version: 1,
  unsentAt: null,
);

class LiveMessagingClient implements MessagingClient {
  var inboxCalls = 0;
  var messageCalls = 0;
  var changeCalls = 0;
  var ticketCalls = 0;

  @override
  Future<ApiResult<List<MessagingConversation>>> inbox() async {
    inboxCalls++;
    return const ApiSuccess([]);
  }

  @override
  Future<ApiResult<List<MessagingMessage>>> messages(
    String conversationId,
  ) async {
    messageCalls++;
    return ApiSuccess([_message()]);
  }

  @override
  Future<ApiResult<MessagingChangePage>> changes(
    String conversationId, {
    required String afterChangeSequence,
  }) async {
    changeCalls++;
    return const ApiSuccess(
      MessagingChangePage(
        highWatermark: '3',
        hasMore: false,
        nextChangeSequence: null,
      ),
    );
  }

  @override
  Future<ApiResult<RealtimeTicket>> issueRealtimeTicket() async {
    ticketCalls++;
    return const ApiError(ServiceUnavailable());
  }

  @override
  Future<ApiResult<MessagingMessage>> send({
    required String conversationId,
    required String clientMessageId,
    required String text,
  }) async => ApiSuccess(_message());
}

void main() {
  test(
    'ignores a deferred Alice response after session clear for Bob',
    () async {
      final client = DeferredMessagingClient();
      final controller = MessagingController(client);
      final pending = controller.loadConversation('c-alice');
      controller.clear();
      client.messagesResult.complete(ApiSuccess([_message()]));
      await pending;

      expect(controller.thread('c-alice'), isEmpty);
      expect(controller.failure, isNull);
    },
  );

  test(
    'reconciles one live event through durable changes and REST refetch',
    () async {
      final client = LiveMessagingClient();
      final controller = MessagingController(client);
      await controller.loadConversation('c-alice');
      await controller.reconcileRealtimeEvent(
        const ConversationChanged('event-1', 'c-alice', '3'),
      );
      await controller.reconcileRealtimeEvent(
        const ConversationChanged('event-1', 'c-alice', '3'),
      );

      expect(client.changeCalls, 1);
      expect(client.inboxCalls, 1);
      expect(client.messageCalls, 2);
      expect(controller.thread('c-alice'), hasLength(1));
    },
  );

  test('requests a fresh ticket after a jittered reconnect delay', () async {
    final client = LiveMessagingClient();
    final reconnect = MessagingRealtimeClient(
      client,
      onReady: () async {},
      onChange: (_) async {},
      schedule: (_, callback) => Timer(Duration.zero, callback),
    );
    // The unavailable ticket result schedules a reconnect, not REST polling.
    // Override through a small local client counter instead of a real socket.
    await reconnect.start();
    await Future<void>.delayed(const Duration(milliseconds: 1));
    await reconnect.stop();
    expect(client.ticketCalls, greaterThanOrEqualTo(2));
  });

  test('ignores a deferred send error after session clear', () async {
    final client = DeferredMessagingClient();
    final controller = MessagingController(client);
    final pending = controller.send(
      'c-alice',
      'Alice private text',
      clientMessageId: 'alice-retry',
    );
    controller.clear();
    client.sendResult.complete(const ApiError(NetworkUnavailable()));
    await pending;

    expect(controller.failure, isNull);
  });
}

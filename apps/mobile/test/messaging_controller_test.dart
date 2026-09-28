import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
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

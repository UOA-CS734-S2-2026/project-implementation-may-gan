import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/messaging/conversation_screen.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'messaging_controller_test.dart'
    show FakeMessagingClient, testConversation, testMessage;
import 'support/fakes.dart';

void main() {
  Widget screen(MessagingController controller) {
    final harness = TestHarness();
    return AppScope(
      services: AppServices(
        session: harness.session,
        postingDays: harness.postingDays,
        drafts: harness.drafts,
        submitter: harness.submitter,
        messaging: controller,
      ),
      child: const MaterialApp(home: ConversationScreen(conversationId: 'c-1')),
    );
  }

  testWidgets('renders reply composition and sends with its parent ID', (
    tester,
  ) async {
    final client = FakeMessagingClient();
    final controller = MessagingController(client);
    await tester.pumpWidget(screen(controller));
    await tester.pumpAndSettle();

    await tester.tap(find.text('hello'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('messages.action.reply')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Replying to: hello'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('messages.composer')),
      'a reply',
    );
    await tester.tap(find.byKey(const Key('messages.send')));
    await tester.pumpAndSettle();
    expect(
      client.calls.any(
        (call) => call.startsWith('send:') && call.endsWith(':m-1'),
      ),
      isTrue,
    );
  });

  testWidgets('renders and resolves a recipient message request', (
    tester,
  ) async {
    final client = FakeMessagingClient()
      ..conversations['c-1'] = testConversation(
        state: 'pending',
        canSend: false,
        canResolve: true,
      )
      ..pages['c-1'] = [
        MessagingPage(items: [testMessage()], nextCursor: null, hasMore: false),
      ];
    final controller = MessagingController(client);
    await tester.pumpWidget(screen(controller));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('messages.acceptRequest')), findsOneWidget);
    await tester.tap(find.byKey(const Key('messages.acceptRequest')));
    await tester.pumpAndSettle();
    expect(client.calls, contains('resolve:accept'));
  });
}

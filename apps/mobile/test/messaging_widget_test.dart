import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/messaging/conversation_screen.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
import 'package:dayli_mobile/messaging/messages_screen.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
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
        feed: harness.feed,
        posts: harness.posts,
        friends: harness.friends,
        drafts: harness.drafts,
        submitter: harness.submitter,
        messaging: controller,
      ),
      child: const MaterialApp(home: ConversationScreen(conversationId: 'c-1')),
    );
  }

  Widget messagesScreen(MessagingController controller) {
    final harness = TestHarness();
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const MessagesScreen()),
        GoRoute(
          path: '/messages/:id',
          builder: (_, __) => const Scaffold(body: Text('conversation')),
        ),
      ],
    );
    return AppScope(
      services: AppServices(
        session: harness.session,
        postingDays: harness.postingDays,
        feed: harness.feed,
        posts: harness.posts,
        friends: harness.friends,
        drafts: harness.drafts,
        submitter: harness.submitter,
        messaging: controller,
      ),
      child: MaterialApp.router(routerConfig: router),
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

  testWidgets(
    'reuses direct-create IDs for retries and replaces changed intent',
    (tester) async {
      final deferred = Completer<ApiResult<DirectConversationResult>>();
      final client = FakeMessagingClient()
        ..deferredDirect = deferred
        ..directResults.addAll([
          const ApiError(NetworkUnavailable()),
          const ApiError(NetworkUnavailable()),
        ]);
      final controller = MessagingController(client);
      await tester.pumpWidget(messagesScreen(controller));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('messages.new')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('messages.recipientId')),
        'known-id',
      );
      await tester.enterText(
        find.byKey(const Key('messages.firstText')),
        'first intent',
      );
      await tester.tap(find.byKey(const Key('messages.createDirect')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('messages.createDirect')));
      expect(
        client.calls.where((call) => call.startsWith('direct:')),
        hasLength(1),
      );

      client.deferredDirect = null;
      deferred.complete(const ApiError(NetworkUnavailable()));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('messages.createDirect')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('messages.firstText')),
        'changed intent',
      );
      await tester.tap(find.byKey(const Key('messages.createDirect')));
      await tester.pumpAndSettle();

      final calls = client.calls
          .where((call) => call.startsWith('direct:'))
          .toList();
      final retryId = calls[0].split(':')[2];
      expect(calls[1].split(':')[2], retryId);
      expect(calls[2].split(':')[2], isNot(retryId));
    },
  );

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

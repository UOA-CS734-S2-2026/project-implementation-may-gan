import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/messaging/conversation_screen.dart';
import 'package:dayli_mobile/messaging/messaging_client.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
import 'package:dayli_mobile/messaging/messages_screen.dart';
import 'package:dayli_mobile/messaging/new_message_screen.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_test/flutter_test.dart';

import 'messaging_controller_test.dart'
    show FakeMessagingClient, testConversation, testMessage;
import 'support/fakes.dart';

class DelayedProfileFriendsClient extends FakeFriendsClient {
  final first = Completer<ApiResult<FriendCard>>();
  final second = Completer<ApiResult<FriendCard>>();
  var calls = 0;

  @override
  Future<ApiResult<FriendCard>> profile(String username) =>
      calls++ == 0 ? first.future : second.future;
}

class DraftLookupController extends MessagingController {
  DraftLookupController(super.client);

  @override
  Future<ApiResult<String?>> findDirect(String recipientId) async =>
      const ApiSuccess(null);
}

class RetryDraftLookupController extends MessagingController {
  RetryDraftLookupController() : super(FakeMessagingClient());
  var calls = 0;

  @override
  Future<ApiResult<String?>> findDirect(String recipientId) async =>
      calls++ == 0
      ? const ApiError(ServiceUnavailable())
      : const ApiSuccess(null);
}

class DelayedInboxMessagingClient extends FakeMessagingClient {
  Completer<ApiResult<List<MessagingConversation>>>? deferredInbox;

  @override
  Future<ApiResult<List<MessagingConversation>>> inbox({
    String folder = 'inbox',
  }) {
    if (folder == 'inbox' && deferredInbox != null) {
      return deferredInbox!.future;
    }
    return super.inbox(folder: folder);
  }
}

MessagingConversation namedConversation(
  String id,
  String name, {
  DateTime? createdAt,
}) {
  final base = testConversation(id: id);
  final latest = base.latestMessage;
  final message = latest == null || createdAt == null
      ? latest
      : MessagingMessage(
          id: latest.id,
          conversationId: latest.conversationId,
          sequence: latest.sequence,
          senderId: latest.senderId,
          clientMessageId: latest.clientMessageId,
          text: latest.text,
          replyToMessageId: latest.replyToMessageId,
          replyPreview: latest.replyPreview,
          version: latest.version,
          createdAt: createdAt,
          editedAt: latest.editedAt,
          unsentAt: latest.unsentAt,
          reactions: latest.reactions,
        );
  return MessagingConversation(
    id: base.id,
    peerId: base.peerId,
    peerName: name,
    requestState: base.requestState,
    unreadCount: base.unreadCount,
    latestMessage: message,
    lastMessageSequence: base.lastMessageSequence,
    lastChangeSequence: base.lastChangeSequence,
    lastReadSequence: base.lastReadSequence,
    receiptSequence: base.receiptSequence,
    canSend: base.canSend,
    canResolveRequest: base.canResolveRequest,
    updatedAt: base.updatedAt,
  );
}

class PickerFriendsClient extends FakeFriendsClient {
  @override
  Future<ApiResult<FriendPage>> loadFriends({String? cursor}) async =>
      const ApiSuccess(
        FriendPage(
          items: [
            FriendCard(
              id: 'known-id',
              username: 'known',
              displayName: 'Known',
              relationship: 'friends',
            ),
          ],
          nextCursor: null,
          hasMore: false,
        ),
      );
}

void main() {
  Widget screen(MessagingController controller) {
    final harness = TestHarness();
    return AppScope(
      services: AppServices(
        session: harness.session,
        postingDays: harness.postingDays,
        friends: harness.friends,
        drafts: harness.drafts,
        submitter: harness.submitter,
        messaging: controller,
      ),
      child: const MaterialApp(home: ConversationScreen(conversationId: 'c-1')),
    );
  }

  Widget messagesScreen(MessagingController controller) {
    final harness = TestHarness(friends: PickerFriendsClient());
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
        friends: harness.friends,
        drafts: harness.drafts,
        submitter: harness.submitter,
        messaging: controller,
      ),
      child: MaterialApp.router(routerConfig: router),
    );
  }

  testWidgets(
    'renders WDCC message tabs, latest dates, unread counts, and the friend-only new-message action',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final client = FakeMessagingClient()
        ..conversations['c-request'] = testConversation(
          id: 'c-request',
          state: 'pending',
          canSend: false,
          canResolve: true,
        );
      final controller = MessagingController(client);
      await tester.pumpWidget(messagesScreen(controller));
      await tester.pumpAndSettle();

      expect(find.text('28/09/2026'), findsOneWidget);
      expect(find.byKey(const Key('messages.unread.c-1')), findsOneWidget);
      expect(find.byKey(const Key('messages.new')), findsOneWidget);
      await tester.tap(find.byKey(const Key('messages.tab.requests')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const Key('messages.conversation.c-request')),
        findsOneWidget,
      );
      await tester.tap(find.text('Accept'));
      await tester.pumpAndSettle();
      expect(client.calls, contains('resolve:accept'));
    },
  );

  test(
    'formats a latest-message date with the local calendar day at a timezone boundary',
    () {
      final conversation = namedConversation(
        'timezone',
        'Timezone',
        createdAt: DateTime.utc(2026, 1, 1, 0, 30),
      );
      expect(
        conversationListDate(
          conversation,
          toLocal: (date) => date.toUtc().subtract(const Duration(hours: 2)),
        ),
        '31/12/2025',
      );
    },
  );

  testWidgets(
    'clears an old inbox before a delayed replacement-account refresh resolves',
    (tester) async {
      final client = DelayedInboxMessagingClient()
        ..conversations.clear()
        ..conversations['old'] = namedConversation('old', 'Old account');
      final controller = MessagingController(client);
      await controller.refreshInbox();
      await tester.pumpWidget(messagesScreen(controller));
      await tester.pumpAndSettle();
      expect(find.text('Old account'), findsOneWidget);

      client.conversations
        ..clear()
        ..['new'] = namedConversation('new', 'New account');
      client.deferredInbox =
          Completer<ApiResult<List<MessagingConversation>>>();
      controller.clear();
      final replacement = controller.refreshInbox();
      await tester.pump();
      expect(find.text('Old account'), findsNothing);

      client.deferredInbox!.complete(
        ApiSuccess([client.conversations['new']!]),
      );
      client.deferredInbox = null;
      await replacement;
      await tester.pumpAndSettle();
      expect(find.text('New account'), findsOneWidget);
      expect(find.text('Old account'), findsNothing);
    },
  );

  testWidgets('clears a delayed draft profile when the session actor changes', (
    tester,
  ) async {
    final friends = DelayedProfileFriendsClient();
    final harness = TestHarness(friends: friends);
    await harness.session.signIn(
      email: 'test@example.test',
      password: 'correct-password',
    );
    final controller = MessagingController(FakeMessagingClient());
    await tester.pumpWidget(
      AppScope(
        services: AppServices(
          session: harness.session,
          postingDays: harness.postingDays,
          friends: friends,
          drafts: harness.drafts,
          submitter: harness.submitter,
          messaging: controller,
        ),
        child: const MaterialApp(home: NewMessageScreen(username: 'ada')),
      ),
    );
    await tester.pump();
    await harness.session.signOut();
    friends.first.complete(
      const ApiSuccess(
        FriendCard(
          id: 'stale',
          username: 'ada',
          displayName: 'Ada Private',
          relationship: 'none',
        ),
      ),
    );
    friends.second.complete(const ApiError(ServiceUnavailable()));
    await tester.pumpAndSettle();
    expect(find.text('Ada Private'), findsNothing);
    expect(find.text('This profile is unavailable.'), findsOneWidget);
    expect(find.byKey(const Key('messages.send')), findsNothing);
  });

  testWidgets(
    'hides a completed draft profile while the next actor lookup waits',
    (tester) async {
      final friends = DelayedProfileFriendsClient();
      final harness = TestHarness(friends: friends);
      await harness.session.signIn(
        email: 'test@example.test',
        password: 'correct-password',
      );
      final controller = DraftLookupController(FakeMessagingClient());
      await tester.pumpWidget(
        AppScope(
          services: AppServices(
            session: harness.session,
            postingDays: harness.postingDays,
            friends: friends,
            drafts: harness.drafts,
            submitter: harness.submitter,
            messaging: controller,
          ),
          child: const MaterialApp(home: NewMessageScreen(username: 'ada')),
        ),
      );
      friends.first.complete(
        const ApiSuccess(
          FriendCard(
            id: 'stale',
            username: 'ada',
            displayName: 'Ada Private',
            relationship: 'none',
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Ada Private'), findsOneWidget);
      harness.testUserId = 'new-account';
      await harness.session.signIn(
        email: 'another@example.test',
        password: 'correct-password',
      );
      await tester.pump();
      expect(harness.session.user?.id, 'new-account');
      expect(find.text('Ada Private'), findsNothing);
      expect(find.byType(TextField), findsNothing);
      friends.second.complete(const ApiError(ServiceUnavailable()));
      await tester.pumpAndSettle();
      expect(find.text('This profile is unavailable.'), findsOneWidget);
    },
  );

  testWidgets('retries a failed direct-pair lookup before composing', (
    tester,
  ) async {
    final friends = DelayedProfileFriendsClient();
    final harness = TestHarness(friends: friends);
    await harness.session.signIn(
      email: 'test@example.test',
      password: 'correct-password',
    );
    final controller = RetryDraftLookupController();
    await tester.pumpWidget(
      AppScope(
        services: AppServices(
          session: harness.session,
          postingDays: harness.postingDays,
          friends: friends,
          drafts: harness.drafts,
          submitter: harness.submitter,
          messaging: controller,
        ),
        child: const MaterialApp(home: NewMessageScreen(username: 'ada')),
      ),
    );
    friends.first.complete(
      const ApiSuccess(
        FriendCard(
          id: 'recipient',
          username: 'ada',
          displayName: 'Ada',
          relationship: 'friends',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Conversation lookup is unavailable.'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
    await tester.tap(find.text('Retry lookup'));
    await tester.pumpAndSettle();
    expect(find.text('Ada'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(controller.calls, 2);
  });

  testWidgets('shows send failure and retains the retry ID', (tester) async {
    final friends = DelayedProfileFriendsClient();
    final harness = TestHarness(friends: friends);
    await harness.session.signIn(
      email: 'test@example.test',
      password: 'correct-password',
    );
    final client = FakeMessagingClient()
      ..directResults.addAll([
        const ApiError(ServiceUnavailable()),
        const ApiError(ServiceUnavailable()),
      ]);
    final controller = DraftLookupController(client);
    await tester.pumpWidget(
      AppScope(
        services: AppServices(
          session: harness.session,
          postingDays: harness.postingDays,
          friends: friends,
          drafts: harness.drafts,
          submitter: harness.submitter,
          messaging: controller,
        ),
        child: const MaterialApp(home: NewMessageScreen(username: 'ada')),
      ),
    );
    friends.first.complete(
      const ApiSuccess(
        FriendCard(
          id: 'recipient',
          username: 'ada',
          displayName: 'Ada',
          relationship: 'friends',
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Hello');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(find.text('Message could not be sent. Try again.'), findsOneWidget);
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    final attempts = client.calls
        .where((call) => call.startsWith('direct:'))
        .toList();
    expect(attempts, hasLength(2));
    expect(attempts[0], attempts[1]);
  });

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
      await tester.tap(find.byKey(const Key('messages.friendPicker')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Known').last);
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

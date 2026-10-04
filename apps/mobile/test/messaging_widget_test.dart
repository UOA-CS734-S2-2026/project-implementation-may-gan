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

const knownFriend = FriendCard(
  id: 'known-id',
  username: 'known',
  displayName: 'Known',
  relationship: 'friends',
);

class PickerFriendsClient extends FakeFriendsClient {
  final results = <ApiResult<FriendPage>>[];
  final cursors = <String?>[];

  @override
  Future<ApiResult<FriendPage>> loadFriends({String? cursor}) async {
    cursors.add(cursor);
    if (results.isNotEmpty) return results.removeAt(0);
    return const ApiSuccess(
      FriendPage(items: [knownFriend], nextCursor: null, hasMore: false),
    );
  }

  @override
  Future<ApiResult<FriendCard>> profile(String username) async =>
      const ApiSuccess(knownFriend);
}

class ExistingPairController extends MessagingController {
  ExistingPairController(super.client);
  final lookedUp = <String>[];

  @override
  Future<ApiResult<String?>> findDirect(String recipientId) async {
    lookedUp.add(recipientId);
    return const ApiSuccess('existing-thread');
  }
}

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
        biometric: harness.biometric,
      ),
      child: const MaterialApp(home: ConversationScreen(conversationId: 'c-1')),
    );
  }

  Widget messagesScreen(
    MessagingController controller, {
    FriendsClient? friends,
  }) {
    final harness = TestHarness(friends: friends ?? PickerFriendsClient());
    final router = GoRouter(
      routes: [
        GoRoute(path: '/', builder: (_, __) => const MessagesScreen()),
        GoRoute(
          path: '/messages/new/:username',
          builder: (_, state) =>
              NewMessageScreen(username: state.pathParameters['username']!),
        ),
        GoRoute(
          path: '/messages/:id',
          builder: (_, state) => Scaffold(
            body: Text('conversation ${state.pathParameters['id']}'),
          ),
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
        biometric: harness.biometric,
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
          feed: harness.feed,
          posts: harness.posts,
          friends: friends,
          drafts: harness.drafts,
          submitter: harness.submitter,
          messaging: controller,
          biometric: harness.biometric,
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
            feed: harness.feed,
            posts: harness.posts,
            friends: friends,
            drafts: harness.drafts,
            submitter: harness.submitter,
            messaging: controller,
            biometric: harness.biometric,
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
          feed: harness.feed,
          posts: harness.posts,
          friends: friends,
          drafts: harness.drafts,
          submitter: harness.submitter,
          messaging: controller,
          biometric: harness.biometric,
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
        const ApiError(ServiceUnavailable()),
      ]);
    final controller = DraftLookupController(client);
    await tester.pumpWidget(
      AppScope(
        services: AppServices(
          session: harness.session,
          postingDays: harness.postingDays,
          feed: harness.feed,
          posts: harness.posts,
          friends: friends,
          drafts: harness.drafts,
          submitter: harness.submitter,
          messaging: controller,
          biometric: harness.biometric,
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
    await tester.enterText(find.byType(TextField), 'Changed');
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    final changed = client.calls
        .where((call) => call.startsWith('direct:'))
        .last;
    expect(changed.split(':')[2], isNot(attempts[0].split(':')[2]));
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

  testWidgets('the Messages picker opens an existing pair without sending', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final client = FakeMessagingClient();
    final controller = ExistingPairController(client);
    await tester.pumpWidget(messagesScreen(controller));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('messages.new')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('messages.friend.known-id')));
    await tester.pumpAndSettle();
    expect(controller.lookedUp, ['known-id']);
    expect(tester.takeException(), isNull);
    expect(find.text('conversation existing-thread'), findsOneWidget);
    expect(client.calls.where((call) => call.startsWith('direct:')), isEmpty);
  });

  testWidgets('the Messages picker retries an initial friends load failure', (
    tester,
  ) async {
    final friends = PickerFriendsClient()
      ..results.addAll([
        const ApiError(ServiceUnavailable()),
        const ApiSuccess(
          FriendPage(items: [knownFriend], nextCursor: null, hasMore: false),
        ),
      ]);
    await tester.pumpWidget(
      messagesScreen(
        MessagingController(FakeMessagingClient()),
        friends: friends,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('messages.new')));
    await tester.pumpAndSettle();
    expect(find.text('Could not load friends.'), findsOneWidget);
    expect(find.byKey(const Key('messages.friend.known-id')), findsNothing);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('messages.friend.known-id')), findsOneWidget);
    expect(friends.cursors, [null, null]);
  });

  testWidgets('the Messages picker retries a failed next friend page', (
    tester,
  ) async {
    final friends = PickerFriendsClient()
      ..results.addAll([
        const ApiSuccess(
          FriendPage(items: [knownFriend], nextCursor: 'page-2', hasMore: true),
        ),
        const ApiError(ServiceUnavailable()),
        const ApiSuccess(
          FriendPage(
            items: [
              FriendCard(
                id: 'later',
                username: 'later',
                displayName: 'Later Friend',
                relationship: 'friends',
              ),
            ],
            nextCursor: null,
            hasMore: false,
          ),
        ),
      ]);
    await tester.pumpWidget(
      messagesScreen(
        MessagingController(FakeMessagingClient()),
        friends: friends,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('messages.new')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('more friends'));
    await tester.pumpAndSettle();
    expect(find.text('Could not load more friends.'), findsOneWidget);
    expect(find.byKey(const Key('messages.friend.known-id')), findsOneWidget);
    await tester.tap(find.text('Retry more friends'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('messages.friend.later')), findsOneWidget);
    expect(friends.cursors, [null, 'page-2', 'page-2']);
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

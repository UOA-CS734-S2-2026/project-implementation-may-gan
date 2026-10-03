import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/media_upload_client.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/router.dart';
import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/compose/composer_screen.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/friends/friends_screen.dart';
import 'package:dayli_mobile/friends/social_profile_screen.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';
import 'support/compose_actions.dart';

class SocialFriendsClient extends FakeFriendsClient {
  SocialFriendsClient({required this.pages, this.discovered});

  final List<FriendsSnapshot> pages;
  final FriendPage? discovered;
  final accepted = <String>[];
  final declined = <String>[];
  final cancelled = <String>[];
  final sent = <String>[];
  final removed = <String>[];
  var calls = 0;

  @override
  Future<ApiResult<FriendsSnapshot>> load() async {
    final page = pages[calls < pages.length ? calls++ : pages.length - 1];
    return ApiSuccess(page);
  }

  @override
  Future<ApiResult<FriendPage>> search(String query, {String? cursor}) async =>
      ApiSuccess(discovered ?? FakeFriendsClient.emptyFriends);

  @override
  Future<ApiResult<void>> accept(String requestId) async {
    accepted.add(requestId);
    return const ApiSuccess(null);
  }

  @override
  Future<ApiResult<void>> decline(String requestId) async {
    declined.add(requestId);
    return const ApiSuccess(null);
  }

  @override
  Future<ApiResult<void>> cancel(String requestId) async {
    cancelled.add(requestId);
    return const ApiSuccess(null);
  }

  @override
  Future<ApiResult<void>> send(String userId) async {
    sent.add(userId);
    return const ApiSuccess(null);
  }

  @override
  Future<ApiResult<void>> remove(String userId) async {
    removed.add(userId);
    return const ApiSuccess(null);
  }
}

const _emptyRequestPage = FriendRequestPage(
  items: [],
  nextCursor: null,
  hasMore: false,
);

class RetryFriendsClient implements FriendsClient {
  var attempts = 0;
  @override
  Future<ApiResult<FriendsSnapshot>> load() async {
    attempts++;
    if (attempts == 1) return const ApiError(ServiceUnavailable());
    return const ApiSuccess(
      FriendsSnapshot(
        friends: FriendPage(
          items: [
            FriendCard(
              id: 'friend',
              username: 'friend',
              displayName: 'Friend',
              relationship: 'friends',
            ),
          ],
          nextCursor: null,
          hasMore: false,
        ),
        incoming: FriendRequestPage(
          items: [],
          nextCursor: null,
          hasMore: false,
        ),
        outgoing: FriendRequestPage(
          items: [],
          nextCursor: null,
          hasMore: false,
        ),
      ),
    );
  }

  @override
  Future<ApiResult<FriendPage>> loadFriends({String? cursor}) async =>
      const ApiSuccess(FriendPage(items: [], nextCursor: null, hasMore: false));
  @override
  Future<ApiResult<FriendRequestPage>> loadRequests(
    String direction, {
    String? cursor,
  }) async => const ApiSuccess(
    FriendRequestPage(items: [], nextCursor: null, hasMore: false),
  );
  @override
  Future<ApiResult<FriendPage>> search(String query, {String? cursor}) async =>
      const ApiSuccess(FriendPage(items: [], nextCursor: null, hasMore: false));
  @override
  Future<ApiResult<FriendCard>> profile(String username) async =>
      const ApiError(ServiceUnavailable());
  @override
  Future<ApiResult<void>> accept(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> cancel(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> decline(String requestId) async =>
      const ApiSuccess(null);
  @override
  Future<ApiResult<void>> remove(String userId) async => const ApiSuccess(null);
  @override
  Future<ApiResult<void>> send(String userId) async => const ApiSuccess(null);
}

class CompletedProfileFriendsClient extends FakeFriendsClient {
  final next = Completer<ApiResult<FriendCard>>();
  var calls = 0;

  @override
  Future<ApiResult<FriendCard>> profile(String username) => calls++ == 0
      ? Future.value(
          const ApiSuccess(
            FriendCard(
              id: 'old-profile',
              username: 'ada',
              displayName: 'Ada Private',
              relationship: 'friends',
            ),
          ),
        )
      : next.future;
}

class OwnProfileFriendsClient extends FakeFriendsClient {
  @override
  Future<ApiResult<FriendCard>> profile(String username) async =>
      const ApiSuccess(
        FriendCard(
          id: 'user-1',
          username: 'jos',
          displayName: 'Jos',
          relationship: 'none',
        ),
      );
}

void main() {
  testWidgets('does not offer friendship or messaging actions on my profile', (
    tester,
  ) async {
    final harness = TestHarness(friends: OwnProfileFriendsClient());
    await harness.session.signIn(
      email: 'test@example.test',
      password: 'correct-password',
    );
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: const MaterialApp(home: SocialProfileScreen(username: 'jos')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('@jos'), findsOneWidget);
    expect(find.text('add friend'), findsNothing);
    expect(find.text('message'), findsNothing);
  });

  testWidgets('routes an app-name username to its /u profile', (tester) async {
    final harness = TestHarness();
    await harness.session.signIn(
      email: 'test@example.test',
      password: 'correct-password',
    );
    final router = buildRouter(harness.session);
    addTearDown(router.dispose);
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    router.go('/u/messages');
    await tester.pumpAndSettle();
    expect(find.byType(SocialProfileScreen), findsOneWidget);
    expect(find.text('This profile is unavailable.'), findsOneWidget);
  });

  testWidgets(
    'clears a completed social profile before the next actor lookup finishes',
    (tester) async {
      final friends = CompletedProfileFriendsClient();
      final harness = TestHarness(friends: friends);
      await harness.session.signIn(
        email: 'test@example.test',
        password: 'correct-password',
      );
      await tester.pumpWidget(
        AppScope(
          services: harness.services,
          child: const MaterialApp(home: SocialProfileScreen(username: 'ada')),
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
      expect(friends.calls, 2);
      friends.next.complete(const ApiError(ServiceUnavailable()));
      await tester.pumpAndSettle();
      expect(find.text('This profile is unavailable.'), findsOneWidget);
    },
  );

  testWidgets(
    'shows a recoverable friends load failure without dereferencing an absent snapshot',
    (tester) async {
      final client = RetryFriendsClient();
      final harness = TestHarness(friends: client);
      await tester.pumpWidget(
        AppScope(
          services: harness.services,
          child: MaterialApp(
            theme: buildDayliTheme(useGoogleFonts: false),
            home: const Scaffold(body: FriendsScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Friends could not load right now.'), findsOneWidget);
      await tester.tap(find.text('try again'));
      await tester.pumpAndSettle();
      expect(find.text('Friend'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'keeps the load-more option when the current friend page has no match',
    (tester) async {
      const friend = FriendCard(
        id: 'ada',
        username: 'ada',
        displayName: 'Ada',
        relationship: 'friends',
      );
      final friends = SocialFriendsClient(
        pages: const [
          FriendsSnapshot(
            friends: FriendPage(
              items: [friend],
              nextCursor: 'next',
              hasMore: true,
            ),
            incoming: _emptyRequestPage,
            outgoing: _emptyRequestPage,
          ),
        ],
      );
      final harness = TestHarness(friends: friends);
      await tester.pumpWidget(
        AppScope(
          services: harness.services,
          child: MaterialApp(
            theme: buildDayliTheme(useGoogleFonts: false),
            home: const Scaffold(body: FriendsScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('friends.filter')),
        'missing',
      );
      await tester.pumpAndSettle();
      expect(
        find.text('No matches in loaded friends. Load more to keep searching.'),
        findsOneWidget,
      );
      expect(find.text('No friends found'), findsNothing);
      expect(find.text('load more'), findsOneWidget);
    },
  );

  testWidgets('stacks friend request actions below the name at 320px', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(320, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    const grace = FriendCard(
      id: 'grace',
      username: 'grace',
      displayName: 'Grace Hopper',
      relationship: 'incoming_pending',
    );
    final friends = SocialFriendsClient(
      pages: const [
        FriendsSnapshot(
          friends: FriendPage(items: [], nextCursor: null, hasMore: false),
          incoming: FriendRequestPage(
            items: [
              FriendRequest(
                id: 'in-grace',
                senderId: 'grace',
                recipientId: 'actor',
                user: grace,
              ),
            ],
            nextCursor: null,
            hasMore: false,
          ),
          outgoing: _emptyRequestPage,
        ),
      ],
    );
    final harness = TestHarness(friends: friends);
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: MaterialApp(
          theme: buildDayliTheme(useGoogleFonts: false),
          home: const Scaffold(body: FriendsScreen()),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('friends.tab.requests')));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(
      tester.getTopLeft(find.text('Accept')).dy,
      greaterThan(tester.getTopLeft(find.text('Grace Hopper')).dy),
    );
    await tester.tap(find.text('Accept'));
    await tester.pumpAndSettle();
    expect(friends.accepted, ['in-grace']);
    await tester.tap(find.text('Decline'));
    await tester.pumpAndSettle();
    expect(friends.declined, ['in-grace']);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'renders WDCC friend tabs, local filtering, discovery, and request actions at phone width',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      const ada = FriendCard(
        id: 'ada',
        username: 'ada',
        displayName: 'Ada Lovelace With A Long Name',
        relationship: 'friends',
      );
      const grace = FriendCard(
        id: 'grace',
        username: 'grace',
        displayName: 'Grace Hopper',
        relationship: 'friends',
      );
      final friends = SocialFriendsClient(
        pages: const [
          FriendsSnapshot(
            friends: FriendPage(
              items: [ada, grace],
              nextCursor: null,
              hasMore: false,
            ),
            incoming: FriendRequestPage(
              items: [
                FriendRequest(
                  id: 'incoming-1',
                  senderId: 'ada',
                  recipientId: 'actor',
                  user: ada,
                ),
              ],
              nextCursor: null,
              hasMore: false,
            ),
            outgoing: FriendRequestPage(
              items: [
                FriendRequest(
                  id: 'outgoing-1',
                  senderId: 'actor',
                  recipientId: 'grace',
                  user: grace,
                ),
              ],
              nextCursor: null,
              hasMore: false,
            ),
          ),
        ],
        discovered: const FriendPage(
          items: [
            FriendCard(
              id: 'search-user',
              username: 'search-user',
              displayName: 'Search User',
              relationship: 'none',
            ),
          ],
          nextCursor: null,
          hasMore: false,
        ),
      );
      final harness = TestHarness(friends: friends);
      await tester.pumpWidget(
        AppScope(
          services: harness.services,
          child: MaterialApp(
            theme: buildDayliTheme(useGoogleFonts: false),
            home: const Scaffold(body: FriendsScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('friends.tab.friends')), findsOneWidget);
      expect(find.byKey(const Key('friends.filter')), findsOneWidget);
      expect(find.text('Message'), findsNWidgets(2));
      expect(find.text('friends'), findsOneWidget);
      expect(find.text('Remove friend'), findsNothing);
      expect(friends.removed, isEmpty);
      await tester.tap(find.byKey(const Key('friends.actions.Grace Hopper')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove friend'));
      await tester.pumpAndSettle();
      expect(friends.removed, ['grace']);

      await tester.enterText(find.byKey(const Key('friends.filter')), 'grace');
      await tester.pumpAndSettle();
      expect(find.text('Ada Lovelace With A Long Name'), findsNothing);
      expect(find.text('Grace Hopper'), findsOneWidget);

      await tester.tap(find.byKey(const Key('friends.discover')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const Key('friends.discoverySearch')),
        'se',
      );
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      expect(find.text('Search User'), findsOneWidget);
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      expect(friends.sent, ['search-user']);
      Navigator.of(tester.element(find.text('Search User'))).pop();
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('friends.tab.requests')));
      await tester.pumpAndSettle();
      expect(find.text('Received'), findsOneWidget);
      expect(find.text('Sent'), findsOneWidget);
      await tester.tap(find.text('Accept'));
      await tester.pumpAndSettle();
      expect(friends.accepted, ['incoming-1']);
      await tester.tap(find.text('Decline'));
      await tester.pumpAndSettle();
      expect(friends.declined, ['incoming-1']);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(friends.cancelled, ['outgoing-1']);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'keeps a full username discovery page scrollable above the phone keyboard',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(390, 844));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      final discovered = FriendPage(
        items: List.generate(
          20,
          (index) => FriendCard(
            id: 'search-$index',
            username: 'search-$index',
            displayName: 'Search result $index',
            relationship: 'none',
          ),
        ),
        nextCursor: 'next-page',
        hasMore: true,
      );
      final friends = SocialFriendsClient(
        pages: const [
          FriendsSnapshot(
            friends: FriendPage(items: [], nextCursor: null, hasMore: false),
            incoming: _emptyRequestPage,
            outgoing: _emptyRequestPage,
          ),
        ],
        discovered: discovered,
      );
      final harness = TestHarness(friends: friends);
      await tester.pumpWidget(
        AppScope(
          services: harness.services,
          child: MaterialApp(
            theme: buildDayliTheme(useGoogleFonts: false),
            home: const Scaffold(body: FriendsScreen()),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('friends.discover')));
      await tester.pumpAndSettle();
      final search = find.byKey(const Key('friends.discoverySearch'));
      await tester.showKeyboard(search);
      await tester.enterText(search, 'se');
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('friends.discoveryResults')), findsOneWidget);
      final discoveryScroll = find.descendant(
        of: find.byKey(const Key('friends.discoveryResults')),
        matching: find.byType(Scrollable),
      );
      await tester.scrollUntilVisible(
        find.text('Search result 19'),
        180,
        scrollable: discoveryScroll,
      );
      expect(find.text('Search result 19'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('load more'),
        180,
        scrollable: discoveryScroll,
      );
      expect(find.text('load more'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('replaces friends state when the authenticated account changes', (
    tester,
  ) async {
    final friends = SocialFriendsClient(
      pages: const [
        FriendsSnapshot(
          friends: FriendPage(
            items: [
              FriendCard(
                id: 'alice',
                username: 'alice',
                displayName: 'Alice private',
                relationship: 'friends',
              ),
            ],
            nextCursor: null,
            hasMore: false,
          ),
          incoming: _emptyRequestPage,
          outgoing: _emptyRequestPage,
        ),
        FriendsSnapshot(
          friends: FriendPage(
            items: [
              FriendCard(
                id: 'bob',
                username: 'bob',
                displayName: 'Bob',
                relationship: 'friends',
              ),
            ],
            nextCursor: null,
            hasMore: false,
          ),
          incoming: _emptyRequestPage,
          outgoing: _emptyRequestPage,
        ),
      ],
    );
    final harness = TestHarness(friends: friends);
    Widget app() => AppScope(
      services: harness.services,
      child: MaterialApp(
        theme: buildDayliTheme(useGoogleFonts: false),
        home: const Scaffold(body: FriendsScreen()),
      ),
    );
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    expect(find.text('Alice private'), findsOneWidget);
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    expect(find.text('Bob'), findsOneWidget);
    expect(find.text('Alice private'), findsNothing);
  });

  testWidgets('shows the WDCC landing page when signed out', (tester) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();

    expect(find.text('one post, every day.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('requires an email when signing in', (tester) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('auth.email')), 'jos');
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();

    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Invalid email address'), findsOneWidget);
  });

  testWidgets('requires username collection during sign-up', (tester) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('auth.switch')));
    await tester.tap(find.byKey(const Key('auth.switch')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('auth.username')), findsOneWidget);
    expect(find.text('Username'), findsOneWidget);
  });

  testWidgets(
    'requires one unchecked legal action before mobile signup issues or sends proof',
    (tester) async {
      final harness = TestHarness(effectiveTerms: true);
      await tester.pumpWidget(
        DayliApp(services: harness.services, useGoogleFonts: false),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('landing.sign-up')));
      await tester.pumpAndSettle();

      final action = find.byKey(const Key('auth.legalAction'));
      expect(action, findsOneWidget);
      expect(tester.widget<CheckboxListTile>(action).value, isFalse);
      expect(find.textContaining('confirm I am 16 or older'), findsOneWidget);
      await tester.enterText(
        find.byKey(const Key('auth.username')),
        'legal_mobile',
      );
      await tester.enterText(
        find.byKey(const Key('auth.email')),
        'mobile@example.test',
      );
      await tester.enterText(
        find.byKey(const Key('auth.password')),
        'correct-password',
      );
      await tester.ensureVisible(find.byKey(const Key('auth.submit')));
      await tester.tap(find.byKey(const Key('auth.submit')));
      await tester.pumpAndSettle();
      expect(
        find.text('Confirm the Terms and that you are 16 or older.'),
        findsOneWidget,
      );
      expect(harness.legalProofRequests, 0);
      expect(harness.signupProofHeaders, isNull);

      await tester.ensureVisible(action);
      await tester.tap(action);
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const Key('auth.submit')));
      await tester.tap(find.byKey(const Key('auth.submit')));
      await tester.pumpAndSettle();
      expect(harness.legalProofRequests, 1);
      expect(harness.signupProofHeaders, ['b' * 64, 'c' * 64]);
    },
  );

  for (final (name, email, signUp, message) in [
    (
      'a taken sign-up email',
      'taken@example.test',
      true,
      'An account with this email already exists. Sign in instead.',
    ),
    (
      'rate-limited sign-up',
      'busy@example.test',
      true,
      'Too many attempts. Wait a few seconds and try again.',
    ),
    (
      'rate-limited sign-in',
      'busy@example.test',
      false,
      'Too many attempts. Wait a few seconds and try again.',
    ),
  ]) {
    testWidgets('explains $name instead of reporting an outage', (
      tester,
    ) async {
      final harness = TestHarness();
      await tester.pumpWidget(
        DayliApp(services: harness.services, useGoogleFonts: false),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(Key(signUp ? 'landing.sign-up' : 'landing.sign-in')),
      );
      await tester.pumpAndSettle();
      if (signUp) {
        await tester.enterText(find.byKey(const Key('auth.name')), 'Jos');
        await tester.enterText(
          find.byKey(const Key('auth.username')),
          'jos_example',
        );
      }
      await tester.enterText(find.byKey(const Key('auth.email')), email);
      await tester.enterText(
        find.byKey(const Key('auth.password')),
        'correct-password',
      );
      await tester.ensureVisible(find.byKey(const Key('auth.submit')));
      await tester.tap(find.byKey(const Key('auth.submit')));
      await tester.pumpAndSettle();

      expect(find.text(message), findsOneWidget);
      expect(
        find.text('Dayli is having trouble right now. Try again shortly.'),
        findsNothing,
      );
      expect(harness.tokens.value, isNull);
    });
  }

  testWidgets('signs in, chooses an audience, and posts today\'s dayli', (
    tester,
  ) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('home.empty')), findsOneWidget);

    expect(find.text('What made you smile today?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();

    final list = find
        .descendant(
          of: find.byType(ComposerScreen),
          matching: find.byType(Scrollable),
        )
        .first;

    // Nothing is sent until the author chooses who can see it.
    await tester.tap(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.audience.error')),
      200,
      scrollable: list,
    );
    expect(find.byKey(const Key('composer.audience.error')), findsOneWidget);
    expect(harness.submitter.submitted, isEmpty);
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.media.0')),
      -200,
      scrollable: list,
    );
    await tester.pumpAndSettle();

    await addFromLibrary(tester, 0);
    await tester.pumpAndSettle();
    expect(find.textContaining('1/3 added'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.rating')),
      100,
      scrollable: list,
    );
    await tester.ensureVisible(find.byKey(const Key('composer.rating')));
    await tester.pumpAndSettle();
    // The slider starts unset; dragging sets it.
    expect(find.text('Slide to rate your day'), findsOneWidget);
    expect(find.textContaining('/10', skipOffstage: false), findsNothing);
    await tester.drag(
      find.byKey(const Key('composer.rating')),
      const Offset(370, 0),
    );
    await tester.pump();
    expect(find.text('10/10', skipOffstage: false), findsOneWidget);
    expect(find.text('Slide to rate your day'), findsNothing);
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.reflectiveAnswer')),
      100,
      scrollable: list,
    );
    await tester.ensureVisible(
      find.byKey(const Key('composer.reflectiveAnswer')),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('composer.reflectiveAnswer')),
      'Coffee by the harbour',
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.tomorrowNote')),
      100,
      scrollable: list,
    );
    await tester.enterText(
      find.byKey(const Key('composer.tomorrowNote')),
      'Bring the camera.',
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.audience.solo')),
      100,
      scrollable: list,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('composer.audience.solo')));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.byKey(const Key('composer.audience.error')), findsNothing);
    await tester.ensureVisible(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();

    final sent = harness.submitter.submitted.single;
    expect(sent.rating, 10);
    expect(sent.reflectiveAnswer, 'Coffee by the harbour');
    expect(sent.tomorrowNote, 'Bring the camera.');
    expect(sent.audience, PostAudience.solo);
    expect(sent.attachments.single.localPath, '/photos/0.jpg');
    expect(sent.attachments.single.status, AttachmentUploadStatus.validated);
    expect(harness.mediaUploads.completed, ['reservation-1']);
    expect(find.byKey(const Key('home.empty')), findsOneWidget);
    expect(harness.drafts.drafts, isEmpty);
  });

  testWidgets('keeps and shows the words when today is already posted', (
    tester,
  ) async {
    final harness = TestHarness(
      submission: const SubmissionRejected(SubmissionConflict.alreadyPosted),
    );
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();

    final list = find
        .descendant(
          of: find.byType(ComposerScreen),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.rating')),
      100,
      scrollable: list,
    );
    await tester.ensureVisible(find.byKey(const Key('composer.rating')));
    await tester.pumpAndSettle();
    await tester.drag(
      find.byKey(const Key('composer.rating')),
      const Offset(-370, 0),
    );
    await tester.pump();
    expect(
      tester.widget<Slider>(find.byKey(const Key('composer.rating'))).value,
      1,
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.reflectiveAnswer')),
      100,
      scrollable: list,
    );
    await tester.enterText(
      find.byKey(const Key('composer.reflectiveAnswer')),
      'Written on a second phone',
    );
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.audience.friends')),
      100,
      scrollable: list,
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('composer.audience.friends')));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();

    expect(find.text("Today's dayli is already posted"), findsOneWidget);
    expect(find.text('Written on a second phone'), findsOneWidget);
    expect(
      harness.drafts.drafts['user-1']!.reflectiveAnswer,
      'Written on a second phone',
    );
    expect(harness.submitter.submitted.single.audience, PostAudience.friends);

    await tester.tap(find.byKey(const Key('composer.discardDraft')));
    await tester.pumpAndSettle();
    expect(harness.drafts.drafts, isEmpty);
  });

  testWidgets('sets a rating of 1 by tapping the start of an unset slider', (
    tester,
  ) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();

    final slider = find.byKey(const Key('composer.rating'));
    await tester.scrollUntilVisible(
      slider,
      100,
      scrollable: find
          .descendant(
            of: find.byType(ComposerScreen),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.ensureVisible(slider);
    await tester.pumpAndSettle();
    // The slider is drawn at 1 while unset; a tap there must still count.
    await tester.tapAt(tester.getRect(slider).centerLeft + const Offset(24, 0));
    await tester.pump(const Duration(milliseconds: 500));

    expect(harness.drafts.drafts['user-1']!.rating, 1);
    expect(find.text('1/10', skipOffstage: false), findsOneWidget);
  });

  testWidgets('explains a rejected upload and holds the post', (tester) async {
    final harness = TestHarness();
    harness.mediaUploads.completeResults.add(
      const ApiSuccess(
        MediaCheck(MediaCheckStatus.failed, failureReason: 'format_mismatch'),
      ),
    );
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();

    await addFromLibrary(tester, 0);
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel("Photo, couldn't be uploaded"), findsOne);
    expect(
      find.text(
        "This file isn't a supported photo or video. Remove it to post.",
      ),
      findsOneWidget,
    );

    await tester.ensureVisible(find.byKey(const Key('composer.submit')));
    await tester.tap(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();
    expect(harness.submitter.submitted, isEmpty);
    expect(
      find.text("Remove the photos or videos that couldn't be uploaded."),
      findsOneWidget,
    );
  });

  testWidgets('signs out when a media upload finds the session expired', (
    tester,
  ) async {
    final harness = TestHarness();
    harness.mediaUploads.reserveResults.add(const ApiError(Unauthenticated()));
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();

    await addFromLibrary(tester, 0);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('landing.sign-in')), findsOneWidget);
    expect(find.byType(ComposerScreen), findsNothing);
    expect(harness.mediaUploads.reserved, hasLength(1));
    expect(harness.session.user, isNull);
  });

  testWidgets('deletes saved media at sign-out after the composer closed', (
    tester,
  ) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();
    await addFromLibrary(tester, 0);
    await tester.pumpAndSettle();
    expect(harness.mediaCompressor.owners, ['user-1']);

    // Leave the composer, so no upload controller is watching the draft.
    await tester.tap(find.byKey(const Key('composer.close')));
    await tester.pumpAndSettle();
    expect(find.byType(ComposerScreen), findsNothing);
    expect(
      harness.drafts.drafts['user-1']!.attachments.single.compressedPath,
      isNotNull,
    );

    await tester.tap(find.byKey(const Key('shell.profile')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('settings.signOut')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('settings.signOut')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('landing.sign-in')), findsOneWidget);
    expect(harness.drafts.drafts, isEmpty);
    expect(harness.mediaCompressor.discardedOwners, ['user-1']);
  });

  testWidgets('keeps media on the device when uploads are off', (tester) async {
    final harness = TestHarness(uploadMedia: false);
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();

    await addFromLibrary(tester, 0);
    await tester.pumpAndSettle();

    // Nothing is compressed or sent to storage that a post couldn't link.
    expect(harness.mediaCompressor.compressed, isEmpty);
    expect(harness.mediaUploads.reserved, isEmpty);
    expect(find.bySemanticsLabel('Photo, saved on this device'), findsOne);
    expect(find.textContaining("aren't posted yet"), findsOneWidget);
    // Let the composer's delayed draft save run.
    await tester.pump(const Duration(milliseconds: 500));
    final attachment = harness.drafts.drafts['user-1']!.attachments.single;
    expect(attachment.status, AttachmentUploadStatus.pending);

    // Posting isn't held for uploads that will never happen.
    await tester.ensureVisible(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();
    expect(find.textContaining('finish uploading'), findsNothing);
  });

  testWidgets('locks the composer while a post is sending', (tester) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('auth.email')),
      'jos@example.test',
    );
    await tester.enterText(
      find.byKey(const Key('auth.password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('auth.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();

    final list = find
        .descendant(
          of: find.byType(ComposerScreen),
          matching: find.byType(Scrollable),
        )
        .first;
    final slider = find.byKey(const Key('composer.rating'));
    await tester.scrollUntilVisible(slider, 100, scrollable: list);
    await tester.ensureVisible(slider);
    await tester.pumpAndSettle();
    await tester.drag(slider, const Offset(300, 0));
    final answer = find.byKey(const Key('composer.reflectiveAnswer'));
    await tester.scrollUntilVisible(answer, 100, scrollable: list);
    await tester.enterText(answer, 'Sent as typed');
    final friends = find.byKey(const Key('composer.audience.friends'));
    await tester.scrollUntilVisible(friends, 100, scrollable: list);
    await tester.pumpAndSettle();
    await tester.tap(friends);
    await tester.pump(const Duration(milliseconds: 500));

    harness.submitter.hold = Completer();
    await tester.tap(find.byKey(const Key('composer.submit')));
    await tester.pump();
    expect(find.text('Posting…'), findsOneWidget);

    TextField field() => tester.widget<TextField>(answer);
    await tester.scrollUntilVisible(answer, -100, scrollable: list);
    expect(field().readOnly, isTrue);
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.audience.solo')),
      100,
      scrollable: list,
    );
    await tester.tap(
      find.byKey(const Key('composer.audience.solo')),
      warnIfMissed: false,
    );
    await tester.pump();

    harness.submitter.hold!.complete(
      const SubmissionFailed(NetworkUnavailable()),
    );
    await tester.pumpAndSettle();

    final sent = harness.submitter.submitted.single;
    expect(sent.reflectiveAnswer, 'Sent as typed');
    expect(sent.audience, PostAudience.friends);
    expect(harness.drafts.drafts['user-1']!.audience, PostAudience.friends);
    await tester.scrollUntilVisible(answer, -100, scrollable: list);
    expect(field().readOnly, isFalse);
  });
}

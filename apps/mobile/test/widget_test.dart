import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/compose/composer_screen.dart';
import 'package:dayli_mobile/friends/friends_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

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

void main() {
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

  testWidgets('defers username collection during sign-up', (tester) async {
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

    expect(find.byKey(const Key('auth.username')), findsNothing);
    expect(find.text('Username'), findsNothing);
  });

  testWidgets('signs in, adds a photo, and posts today\'s dayli', (
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

    // Posting without media is refused, as in WDCC.
    await tester.tap(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();
    expect(find.text('Please upload at least one file'), findsOneWidget);
    expect(harness.submitter.submitted, isEmpty);

    await tester.tap(find.byKey(const Key('composer.media.0')));
    await tester.pumpAndSettle();
    expect(find.text('1/3 added'), findsOneWidget);

    final list = find
        .descendant(
          of: find.byType(ComposerScreen),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      find.byKey(const Key('composer.rating.8')),
      100,
      scrollable: list,
    );
    await tester.ensureVisible(find.byKey(const Key('composer.rating.8')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('composer.rating.8')));
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
    await tester.pump(const Duration(milliseconds: 500));
    await tester.ensureVisible(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('composer.submit')));
    await tester.pumpAndSettle();

    final sent = harness.submitter.submitted.single;
    expect(sent.rating, 8);
    expect(sent.reflectiveAnswer, 'Coffee by the harbour');
    expect(sent.attachments.single.localPath, '/photos/0.jpg');
    expect(find.byKey(const Key('home.empty')), findsOneWidget);
    expect(harness.drafts.drafts, isEmpty);
  });
}

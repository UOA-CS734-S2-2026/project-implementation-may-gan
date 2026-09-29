import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/friends_client.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/compose/composer_screen.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/friends/friends_screen.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
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

    await tester.tap(find.byKey(const Key('composer.media.0')));
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

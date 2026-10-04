import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/auth/username_setup_screen.dart';
import 'package:dayli_mobile/compose/composer_screen.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/home/home_screen.dart';
import 'package:dayli_mobile/landing/landing_screen.dart';
import 'package:dayli_mobile/settings/settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

/// Delivers [link] the way the Flutter engine delivers a custom-scheme URL
/// opened by the Siri action, the Android shortcut, or another app.
Future<void> openLink(WidgetTester tester, String link) async {
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
    SystemChannels.navigation.name,
    SystemChannels.navigation.codec.encodeMethodCall(
      MethodCall('pushRouteInformation', {'location': link}),
    ),
    (_) {},
  );
  await tester.pumpAndSettle();
}

Future<TestHarness> signedInApp(WidgetTester tester) async {
  final harness = TestHarness();
  harness.tokens.value = 'token-1';
  await tester.pumpWidget(
    DayliApp(services: harness.services, useGoogleFonts: false),
  );
  await tester.pumpAndSettle();
  expect(find.byType(HomeScreen), findsOneWidget);
  return harness;
}

Future<TestHarness> signedOutApp(
  WidgetTester tester, {
  String? username = 'jos',
}) async {
  final harness = TestHarness()..sessionUsername = username;
  await tester.pumpWidget(
    DayliApp(services: harness.services, useGoogleFonts: false),
  );
  await tester.pumpAndSettle();
  expect(find.byType(LandingScreen), findsOneWidget);
  return harness;
}

Future<void> signIn(WidgetTester tester) async {
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
}

/// Lets the composer's delayed draft save run.
Future<void> settleDraft(WidgetTester tester) async {
  await tester.pump(const Duration(seconds: 1));
  await tester.pumpAndSettle();
}

/// Scrolls the composer until the rating slider is built. The composer list is
/// lazy, so rows below the fold do not exist until scrolled to.
Future<void> scrollToRating(WidgetTester tester) async {
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
  await tester.pumpAndSettle();
}

Future<void> expectRating(WidgetTester tester, int rating) async {
  expect(find.byType(ComposerScreen), findsOneWidget);
  await scrollToRating(tester);
  expect(find.text('$rating/10', skipOffstage: false), findsOneWidget);
}

Future<void> expectUnrated(WidgetTester tester) async {
  expect(find.byType(ComposerScreen), findsOneWidget);
  await scrollToRating(tester);
  expect(
    find.text('Slide to rate your day', skipOffstage: false),
    findsOneWidget,
  );
  expect(find.textContaining('/10', skipOffstage: false), findsNothing);
}

void main() {
  group('signed in', () {
    testWidgets(
      'opens today\'s composer with a valid rating and posts nothing',
      (tester) async {
        final harness = await signedInApp(tester);

        await openLink(tester, 'dayli://app/post?rating=7');
        await settleDraft(tester);

        await expectRating(tester, 7);
        expect(harness.drafts.drafts['user-1']?.rating, 7);
        // The link only fills the slider. No audience is chosen and nothing
        // is sent until the author taps Post.
        expect(harness.drafts.drafts['user-1']?.audience, isNull);
        expect(harness.submitter.submitted, isEmpty);
      },
    );

    for (final (name, link) in [
      ('out of range', 'dayli://app/post?rating=11'),
      ('zero', 'dayli://app/post?rating=0'),
      ('not a number', 'dayli://app/post?rating=great'),
      ('a fraction', 'dayli://app/post?rating=7.5'),
      ('missing', 'dayli://app/post'),
    ]) {
      testWidgets('opens the composer empty when the rating is $name', (
        tester,
      ) async {
        final harness = await signedInApp(tester);

        await openLink(tester, link);
        await settleDraft(tester);

        await expectUnrated(tester);
        expect(harness.drafts.drafts['user-1']?.rating, isNull);
        // No notice about the ignored rating.
        expect(
          find.textContaining(RegExp('rating', caseSensitive: false)),
          findsNothing,
        );
        expect(harness.submitter.submitted, isEmpty);
      });
    }

    testWidgets('ignores every parameter except the rating', (tester) async {
      final harness = await signedInApp(tester);

      await openLink(
        tester,
        'dayli://app/post?rating=4&audience=friends&reflectiveAnswer=hi&submit=1',
      );
      await settleDraft(tester);

      await expectRating(tester, 4);
      final draft = harness.drafts.drafts['user-1']!;
      expect(draft.audience, isNull);
      expect(draft.reflectiveAnswer, isEmpty);
      expect(harness.submitter.submitted, isEmpty);
    });

    testWidgets('replaces the rating of a draft already saved for today', (
      tester,
    ) async {
      final harness = await signedInApp(tester);
      harness.drafts.drafts['user-1'] = DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-25',
        promptId: 'prompt-09-25',
        promptText: 'What made you smile today?',
        idempotencyKey: 'key-1',
        updatedAt: DateTime.utc(2026, 9, 25, 1),
        rating: 2,
        reflectiveAnswer: 'A walk',
        audience: PostAudience.solo,
      );

      await openLink(tester, 'dayli://app/post?rating=9');
      await settleDraft(tester);

      final draft = harness.drafts.drafts['user-1']!;
      expect(draft.rating, 9);
      expect(draft.reflectiveAnswer, 'A walk');
      expect(harness.submitter.submitted, isEmpty);
    });

    testWidgets(
      'the same link again restores its rating after the slider moved',
      (tester) async {
        final harness = await signedInApp(tester);

        await openLink(tester, 'dayli://app/post?rating=7');
        await settleDraft(tester);
        await expectRating(tester, 7);

        // Move the slider away from the linked rating.
        final slider = find.byType(Slider, skipOffstage: false);
        await tester.ensureVisible(slider);
        await tester.pumpAndSettle();
        await tester.drag(slider, const Offset(-200, 0));
        await settleDraft(tester);
        expect(find.text('7/10', skipOffstage: false), findsNothing);

        await openLink(tester, 'dayli://app/post?rating=7');
        await settleDraft(tester);

        expect(harness.drafts.drafts['user-1']?.rating, 7);
        await expectRating(tester, 7);
        expect(harness.submitter.submitted, isEmpty);
      },
    );

    testWidgets(
      'keeps the linked rating until a retry makes the draft editable',
      (tester) async {
        final harness = await signedInApp(tester);
        harness.postingDays.result = const ApiError(NetworkUnavailable());

        await openLink(tester, 'dayli://app/post?rating=7');
        expect(find.text("Today's prompt isn't here yet"), findsOneWidget);

        harness.postingDays.result = ApiSuccess(postingDay());
        await tester.tap(find.text('Try again'));
        await settleDraft(tester);

        await expectRating(tester, 7);
        expect(harness.drafts.drafts['user-1']?.rating, 7);

        // Applied once: a later slider move stays.
        final slider = find.byType(Slider, skipOffstage: false);
        await tester.ensureVisible(slider);
        await tester.pumpAndSettle();
        await tester.drag(slider, const Offset(-200, 0));
        await settleDraft(tester);
        expect(find.text('7/10', skipOffstage: false), findsNothing);
        expect(harness.submitter.submitted, isEmpty);
      },
    );

    testWidgets('a link that is not the composer opens home', (tester) async {
      await signedInApp(tester);

      await openLink(tester, 'dayli://app/settings');

      expect(find.byType(SettingsScreen), findsNothing);
      expect(find.byType(HomeScreen), findsOneWidget);
    });

    testWidgets('opens the composer from a link that launched the app', (
      tester,
    ) async {
      final harness = TestHarness();
      harness.tokens.value = 'token-1';
      await tester.pumpWidget(
        DayliApp(
          services: harness.services,
          useGoogleFonts: false,
          initialLocation: 'dayli://app/post?rating=6',
        ),
      );
      await tester.pumpAndSettle();
      await settleDraft(tester);

      await expectRating(tester, 6);
      expect(harness.submitter.submitted, isEmpty);
    });
  });

  group('signed out', () {
    testWidgets('a link cannot reach the composer before sign-in', (
      tester,
    ) async {
      final harness = await signedOutApp(tester);

      await openLink(tester, 'dayli://app/post?rating=7');

      expect(find.byType(ComposerScreen), findsNothing);
      expect(find.byType(LandingScreen), findsOneWidget);
      // The composer never loaded, so no prompt or draft was read.
      expect(harness.postingDays.calls, 0);
      expect(harness.drafts.writes, 0);
    });

    testWidgets('opens the remembered composer after sign-in', (tester) async {
      final harness = await signedOutApp(tester);

      await openLink(tester, 'dayli://app/post?rating=7');
      await signIn(tester);
      await settleDraft(tester);

      await expectRating(tester, 7);
      expect(harness.submitter.submitted, isEmpty);
    });

    testWidgets('forgets an invalid rating but still opens the composer', (
      tester,
    ) async {
      await signedOutApp(tester);

      await openLink(tester, 'dayli://app/post?rating=12');
      await signIn(tester);
      await settleDraft(tester);

      await expectUnrated(tester);
    });

    testWidgets('finishes username setup before opening the composer', (
      tester,
    ) async {
      final harness = await signedOutApp(tester, username: null);

      await openLink(tester, 'dayli://app/post?rating=5');
      await signIn(tester);

      expect(find.byType(UsernameSetupScreen), findsOneWidget);
      expect(find.byType(ComposerScreen), findsNothing);

      // A second link while setup is unfinished still can't skip it.
      await openLink(tester, 'dayli://app/post?rating=5');
      expect(find.byType(UsernameSetupScreen), findsOneWidget);
      expect(harness.postingDays.calls, 0);

      await tester.enterText(find.byKey(const Key('setup.username')), 'jos');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await settleDraft(tester);

      await expectRating(tester, 5);
      expect(harness.submitter.submitted, isEmpty);
    });

    testWidgets('signing in without a link still opens home', (tester) async {
      await signedOutApp(tester);

      await signIn(tester);

      expect(find.byType(HomeScreen), findsOneWidget);
      expect(find.byType(ComposerScreen), findsNothing);
    });

    testWidgets('finishing username setup without a link opens home', (
      tester,
    ) async {
      await signedOutApp(tester, username: null);

      await signIn(tester);
      expect(find.byType(UsernameSetupScreen), findsOneWidget);
      await tester.enterText(find.byKey(const Key('setup.username')), 'jos');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();

      expect(find.byType(HomeScreen), findsOneWidget);
      expect(find.byType(ComposerScreen), findsNothing);
    });
  });
}

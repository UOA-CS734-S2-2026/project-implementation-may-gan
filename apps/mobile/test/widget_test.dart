import 'package:dayli_mobile/app/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
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

  testWidgets('asks for an email when signing in with a username', (
    tester,
  ) async {
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

    expect(find.text('Sign in with your email for now.'), findsOneWidget);
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

    await tester.tap(find.byKey(const Key('shell.openMenu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('shell.newDayli')));
    await tester.pumpAndSettle();

    // WDCC shows the fields once media is added.
    expect(find.byKey(const Key('composer.reflectiveAnswer')), findsNothing);
    await tester.tap(find.byKey(const Key('composer.media.0')));
    await tester.pumpAndSettle();
    expect(find.text('1/3 uploaded'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('composer.rating')), '8');
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

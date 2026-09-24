import 'package:dayli_mobile/app/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

void main() {
  testWidgets('shows sign-in when there is no stored session', (tester) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();

    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('signs in, composes, and posts today\'s dayli', (tester) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
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
    expect(find.text('What made you smile today?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('today.compose')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('composer.rating.8')));
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
    expect(find.text('Your dayli is in.'), findsOneWidget);
    expect(harness.drafts.drafts, isEmpty);
  });
}

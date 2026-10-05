import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

void main() {
  testWidgets(
    'blocked accounts must explicitly accept current Terms before home',
    (tester) async {
      final harness = TestHarness(
        effectiveTerms: true,
        accountRestriction: 'terms_blocked',
      )..tokens.value = 'token-1';
      await tester.pumpWidget(
        DayliApp(services: harness.services, useGoogleFonts: false),
      );
      await tester.pumpAndSettle();

      expect(harness.session.status, SessionStatus.legalAcceptanceRequired);
      expect(find.byKey(const Key('legal.acceptanceAction')), findsOneWidget);
      expect(tester.widget<Checkbox>(find.byType(Checkbox)).value, isFalse);
      expect(find.byKey(const Key('legal.acceptanceSubmit')), findsOneWidget);

      await tester.tap(find.byKey(const Key('legal.acceptanceAction')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('legal.acceptanceSubmit')));
      await tester.pumpAndSettle();

      expect(harness.session.status, SessionStatus.signedIn);
      expect(harness.accountRestriction, 'active');
    },
  );

  testWidgets(
    'an active app enters Terms acceptance when Terms become effective',
    (tester) async {
      final harness = TestHarness(effectiveTerms: true)
        ..tokens.value = 'token-1';
      await tester.pumpWidget(
        DayliApp(services: harness.services, useGoogleFonts: false),
      );
      await tester.pumpAndSettle();
      expect(harness.session.status, SessionStatus.signedIn);

      harness.accountRestriction = 'terms_blocked';
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(harness.session.status, SessionStatus.legalAcceptanceRequired);
      expect(find.byKey(const Key('legal.acceptanceAction')), findsOneWidget);
    },
  );

  testWidgets('expired acceptance sends the account back to sign-in', (
    tester,
  ) async {
    final harness = TestHarness(
      effectiveTerms: true,
      accountRestriction: 'terms_blocked',
      acceptanceExpired: true,
    )..tokens.value = 'token-1';
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('legal.acceptanceAction')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('legal.acceptanceSubmit')));
    await tester.pumpAndSettle();
    expect(harness.session.status, SessionStatus.signedOut);
    expect(harness.tokens.value, isNull);
    expect(find.byKey(const Key('legal.acceptanceAction')), findsNothing);
  });

  testWidgets('blocked accounts can still sign out', (tester) async {
    final harness = TestHarness(
      effectiveTerms: true,
      accountRestriction: 'terms_blocked',
    )..tokens.value = 'token-1';
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('legal.acceptanceSignOut')));
    await tester.pumpAndSettle();
    expect(harness.session.status, SessionStatus.signedOut);
  });
}

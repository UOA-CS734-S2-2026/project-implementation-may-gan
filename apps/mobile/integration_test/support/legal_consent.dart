import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/ui/dayli_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _consentText =
    'I agree to the Terms of Service, acknowledge the Privacy Policy, and confirm I am 16 or older.';

Future<void> acceptRequiredLegalConsent(
  WidgetTester tester,
  SessionController session,
) async {
  for (
    var attempt = 0;
    attempt < 50 && session.status != SessionStatus.legalAcceptanceRequired;
    attempt++
  ) {
    await tester.pump(const Duration(milliseconds: 200));
  }
  expect(session.status, SessionStatus.legalAcceptanceRequired);
  await tester.pumpAndSettle(const Duration(milliseconds: 100));

  expect(find.byKey(const Key('legal.openTerms')), findsOneWidget);
  expect(find.byKey(const Key('legal.openPrivacy')), findsOneWidget);
  expect(find.text(_consentText), findsOneWidget);

  for (final link in <({Key key, String title})>[
    (key: const Key('legal.openTerms'), title: 'Terms of Service'),
    (key: const Key('legal.openPrivacy'), title: 'Privacy Policy'),
  ]) {
    await tester.tap(find.byKey(link.key));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    expect(find.text(link.title), findsWidgets);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
  }

  final action = find.byKey(const Key('legal.acceptanceAction'));
  final submit = find.byKey(const Key('legal.acceptanceSubmit'));
  expect(tester.widget<CheckboxListTile>(action).value, isFalse);
  expect(tester.widget<DayliButton>(submit).onPressed, isNull);

  await tester.tap(action);
  await tester.pump();
  expect(tester.widget<CheckboxListTile>(action).value, isTrue);
  expect(tester.widget<DayliButton>(submit).onPressed, isNotNull);
  await tester.tap(submit);

  for (
    var attempt = 0;
    attempt < 50 && session.status != SessionStatus.signedIn;
    attempt++
  ) {
    await tester.pump(const Duration(milliseconds: 200));
  }
  await tester.pumpAndSettle(const Duration(milliseconds: 100));
  expect(session.status, SessionStatus.signedIn);
  expect(find.byKey(const Key('home.empty')), findsOneWidget);
}

import 'package:dayli_mobile/app/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

void main() {
  testWidgets('sign-up shows compact draft legal links that open privacy', (
    tester,
  ) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/sign-up',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Privacy Policy'), findsOneWidget);
    expect(find.text('Terms of Service'), findsOneWidget);
    expect(find.text('(draft)'), findsOneWidget);
    expect(
      find.text(
        'Draft documents for review. They are not approved terms or privacy notices.',
      ),
      findsNothing,
    );
    expect(find.byType(Checkbox), findsNothing);

    await tester.tap(find.byKey(const Key('legal.openPrivacy')));
    await tester.pumpAndSettle();
    expect(find.text('Privacy Policy'), findsOneWidget);
  });

  testWidgets(
    'sign-in shows compact draft legal links without a consent notice',
    (tester) async {
      final harness = TestHarness();
      await tester.pumpWidget(
        DayliApp(
          services: harness.services,
          useGoogleFonts: false,
          initialLocation: '/sign-in',
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Privacy Policy'), findsOneWidget);
      expect(find.text('Terms of Service'), findsOneWidget);
      expect(find.text('(draft)'), findsOneWidget);
      expect(
        find.text(
          'Draft documents for review. They are not approved terms or privacy notices.',
        ),
        findsNothing,
      );
      expect(find.byType(Checkbox), findsNothing);
    },
  );
}

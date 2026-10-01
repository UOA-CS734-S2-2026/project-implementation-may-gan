import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/router.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

void main() {
  testWidgets('opens a legal document from the public landing screen', (
    tester,
  ) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('legal.openPrivacy')));
    await tester.pumpAndSettle();

    expect(find.text('Privacy Policy'), findsOneWidget);
    expect(find.byKey(const Key('legal.draftNotice')), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('landing.sign-in')), findsOneWidget);
  });

  testWidgets('allows legal routes while the session is still unknown', (
    tester,
  ) async {
    final harness = TestHarness();
    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
        initialLocation: '/terms',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Terms of Service'), findsOneWidget);
    await tester.tap(find.byTooltip('Back'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('landing.sign-in')), findsOneWidget);
  });

  testWidgets('allows a legal route for a signed-in session', (tester) async {
    final harness = TestHarness();
    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );
    final router = buildRouter(harness.session);
    await tester.pumpWidget(
      AppScope(
        services: harness.services,
        child: MaterialApp.router(routerConfig: router),
      ),
    );
    router.go('/terms');
    await tester.pump();

    expect(router.routerDelegate.currentConfiguration.uri.path, '/terms');
    router.dispose();
  });
}

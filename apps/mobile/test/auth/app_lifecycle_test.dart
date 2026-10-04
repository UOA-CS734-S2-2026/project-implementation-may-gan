import 'package:dayli_mobile/app/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

void main() {
  testWidgets('renders lock screen and obscures content when app goes inactive', (tester) async {
    final harness = TestHarness();
    
    // Simulate biometric service is enabled
    harness.biometric.enabled = true;
    harness.biometric.locked = false;

    // Pump the app
    await tester.pumpWidget(
      DayliApp(
        services: harness.services,
        useGoogleFonts: false,
      ),
    );
    await tester.pumpAndSettle();

    // Verify lock screen is not visible
    expect(find.text('App Locked'), findsNothing);

    // Simulate app going inactive (e.g. app switcher or biometric prompt)
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    await tester.pump();

    // Verify lock screen is now visible and obscuring content
    expect(find.text('App Locked'), findsOneWidget);
  });
}

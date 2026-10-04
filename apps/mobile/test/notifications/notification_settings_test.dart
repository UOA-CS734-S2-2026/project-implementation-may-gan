import 'package:dayli_mobile/app/app_scope.dart';
import 'package:dayli_mobile/app/theme.dart';
import 'package:dayli_mobile/notifications/notification_consent.dart';
import 'package:dayli_mobile/settings/settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

class _Preference implements NotificationPreferenceClient {
  _Preference(this.value);

  bool value;
  final updates = <bool>[];

  @override
  Future<bool> get(NotificationPreferenceOperation operation) async => value;

  @override
  Future<bool> update(
    bool enabled,
    NotificationPreferenceOperation operation,
  ) async {
    updates.add(enabled);
    value = enabled;
    return value;
  }
}

void main() {
  testWidgets(
    'unsupported build shows account opt-in and lets the user disable it',
    (tester) async {
      final preference = _Preference(true);
      final consent = NotificationConsentController(client: preference);
      final harness = TestHarness(notificationConsent: consent);
      await harness.session.signIn(
        email: 'jos@example.test',
        password: 'correct-password',
      );
      await tester.pump();

      await tester.pumpWidget(
        AppScope(
          services: harness.services,
          child: MaterialApp(
            theme: buildDayliTheme(useGoogleFonts: false),
            home: const SettingsScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final notificationSwitch = find.byKey(
        const Key('settings.notifications'),
      );
      expect(notificationSwitch, findsOneWidget);
      expect(
        find.descendant(
          of: notificationSwitch,
          matching: find.text('Mobile notifications'),
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          'Enabled for your account on supported devices. You can turn it off here.',
        ),
        findsOneWidget,
      );
      final tile = tester.widget<SwitchListTile>(notificationSwitch);
      expect(tile.value, isTrue);
      expect(tile.onChanged, isNotNull);
      expect(find.byKey(const Key('settings.biometricUnlock')), findsOneWidget);
      expect(find.byType(SwitchListTile), findsNWidgets(2));

      await tester.ensureVisible(notificationSwitch);
      await tester.tap(notificationSwitch);
      await tester.pumpAndSettle();

      expect(preference.updates, [false]);
      expect(consent.enabled, isFalse);
      expect(
        find.text('This build cannot receive notifications.'),
        findsOneWidget,
      );
    },
  );
}

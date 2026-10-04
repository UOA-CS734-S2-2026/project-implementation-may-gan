import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/auth/lock_screen.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../support/fakes.dart';

const _landingText = 'one post, every day.';

void main() {
  /// Pumps the app with Biometric Unlock on. The lock screen's first prompt
  /// succeeds, so the app ends up unlocked.
  Future<TestHarness> pumpUnlockedApp(
    WidgetTester tester, {
    bool signedIn = false,
  }) async {
    final harness = TestHarness();
    harness.biometricPreference.enabled = true;
    if (signedIn) harness.tokens.value = 'token-1';
    await tester.pumpWidget(
      DayliApp(services: harness.services, useGoogleFonts: false),
    );
    await tester.pumpAndSettle();
    expect(find.text('App Locked'), findsNothing);
    expect(harness.biometric.isLocked, isFalse);
    return harness;
  }

  void lifecycle(WidgetTester tester, AppLifecycleState state) =>
      tester.binding.handleAppLifecycleStateChanged(state);

  Future<void> background(WidgetTester tester) async {
    lifecycle(tester, AppLifecycleState.inactive);
    lifecycle(tester, AppLifecycleState.hidden);
    lifecycle(tester, AppLifecycleState.paused);
    await tester.pump();
  }

  Future<void> foreground(WidgetTester tester) async {
    lifecycle(tester, AppLifecycleState.hidden);
    lifecycle(tester, AppLifecycleState.inactive);
    lifecycle(tester, AppLifecycleState.resumed);
    await tester.pumpAndSettle();
  }

  testWidgets('inactive shows a privacy shield without locking', (
    tester,
  ) async {
    final harness = await pumpUnlockedApp(tester);
    final prompts = harness.localAuth.prompts;

    lifecycle(tester, AppLifecycleState.inactive);
    await tester.pump();
    expect(find.byType(PrivacyShield), findsOneWidget);
    expect(find.text('App Locked'), findsNothing);

    lifecycle(tester, AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byType(PrivacyShield), findsNothing);
    expect(find.text('App Locked'), findsNothing);
    expect(harness.localAuth.prompts, prompts);
  });

  testWidgets('backgrounding locks and prompts again on return', (
    tester,
  ) async {
    final harness = await pumpUnlockedApp(tester);
    harness.localAuth.result = false;

    await background(tester);
    await foreground(tester);
    expect(find.text('App Locked'), findsOneWidget);
    final prompts = harness.localAuth.prompts;

    // A second trip prompts again even though the lock screen stayed up.
    await background(tester);
    await foreground(tester);
    expect(harness.localAuth.prompts, prompts + 1);

    harness.localAuth.result = true;
    await tester.tap(find.byKey(const Key('lock.unlock')));
    await tester.pumpAndSettle();
    expect(find.text('App Locked'), findsNothing);
  });

  // Review case: the disable confirmation is open, Home is pressed, and the
  // sticky prompt stays pending through resume.
  testWidgets(
    'a pending disable prompt cannot leave the app unlocked in the background',
    (tester) async {
      final harness = await pumpUnlockedApp(tester);
      final prompt = harness.localAuth.holdNextPrompt();
      final disabling = harness.biometric.setEnabled(false);
      await tester.pump();

      // The prompt itself makes the app inactive. That must not lock.
      lifecycle(tester, AppLifecycleState.inactive);
      await tester.pump();
      expect(find.text('App Locked'), findsNothing);
      expect(find.byType(PrivacyShield), findsNothing);

      // Home while the prompt is open.
      lifecycle(tester, AppLifecycleState.hidden);
      lifecycle(tester, AppLifecycleState.paused);
      await tester.pump();
      await foreground(tester);
      expect(find.text('App Locked'), findsOneWidget);
      // The lock screen joined the pending prompt instead of opening another.
      expect(harness.localAuth.prompts, 2);

      prompt.complete(false);
      await tester.pumpAndSettle();
      await disabling;
      expect(find.text('App Locked'), findsOneWidget);
      expect(harness.biometric.isEnabled, isTrue);
    },
  );

  testWidgets('system back does nothing while locked', (tester) async {
    final harness = await pumpUnlockedApp(tester);
    await tester.tap(find.byKey(const Key('landing.sign-in')));
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);

    harness.localAuth.result = false;
    await background(tester);
    await foreground(tester);
    expect(find.text('App Locked'), findsOneWidget);

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    harness.localAuth.result = true;
    await tester.tap(find.byKey(const Key('lock.unlock')));
    await tester.pumpAndSettle();
    expect(find.text('App Locked'), findsNothing);
    expect(find.text('Welcome back'), findsOneWidget);

    // Unlocked, back works again.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsNothing);
  });

  testWidgets('screen readers cannot reach content behind the lock', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    String tree() => tester
        .binding
        .renderViews
        .first
        .owner!
        .semanticsOwner!
        .rootSemanticsNode!
        .toStringDeep();
    final harness = await pumpUnlockedApp(tester);
    expect(tree(), contains(_landingText));

    harness.localAuth.result = false;
    await background(tester);
    await foreground(tester);
    expect(find.text('App Locked'), findsOneWidget);
    expect(tree(), isNot(contains(_landingText)));
    expect(tree(), contains('App Locked'));
    semantics.dispose();
  });

  // Review case: enabled, device authentication removed, relock, recovery.
  testWidgets(
    'recovers by signing in again after device authentication is removed',
    (tester) async {
      final harness = await pumpUnlockedApp(tester, signedIn: true);
      expect(harness.session.status, SessionStatus.signedIn);
      harness.drafts.drafts['user-1'] = DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-25',
        promptId: 'p1',
        promptText: 'What made today?',
        idempotencyKey: 'k1',
        updatedAt: DateTime.utc(2026, 9, 25),
      );

      // The owner removes their passcode and biometrics in system Settings.
      await background(tester);
      harness.localAuth.removeDeviceAuthentication();
      await foreground(tester);

      expect(find.text('App Locked'), findsOneWidget);
      expect(find.byKey(const Key('lock.unlock')), findsNothing);
      expect(find.byKey(const Key('lock.recover')), findsOneWidget);
      expect(harness.biometric.isLocked, isTrue);

      await tester.tap(find.byKey(const Key('lock.recover')));
      await tester.pumpAndSettle();

      expect(find.text('App Locked'), findsNothing);
      expect(harness.biometric.isEnabled, isFalse);
      expect(harness.biometricPreference.enabled, isFalse);
      expect(harness.session.status, SessionStatus.signedOut);
      expect(harness.tokens.value, isNull);
      expect(find.text(_landingText), findsOneWidget);
      // The draft waits for the same account's next sign-in.
      expect(harness.drafts.drafts, contains('user-1'));

      // With the lock off, later background trips no longer lock.
      await background(tester);
      await foreground(tester);
      expect(find.text('App Locked'), findsNothing);
    },
  );
}

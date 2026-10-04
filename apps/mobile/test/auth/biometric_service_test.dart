import 'package:dayli_mobile/auth/biometric_service.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../support/fakes.dart';

/// A token store whose local clear fails, so sign-out cannot complete.
class FailingClearTokenStore extends MemoryTokenStore {
  @override
  Future<void> clear() async => throw StateError('storage unavailable');
}

void main() {
  late FakeLocalAuthentication auth;
  late MemoryBiometricPreferenceStore store;

  setUp(() {
    auth = FakeLocalAuthentication();
    store = MemoryBiometricPreferenceStore();
  });

  /// An enabled service that the owner has already unlocked.
  Future<BiometricService> unlockedService() async {
    store.enabled = true;
    final service = BiometricService(store, auth);
    expect(await service.unlock(), BiometricResult.success);
    expect(service.isLocked, isFalse);
    auth.reasons.clear();
    return service;
  }

  group('initial state', () {
    test('starts unlocked when disabled', () {
      final service = BiometricService(store, auth);
      expect(service.isEnabled, isFalse);
      expect(service.isLocked, isFalse);
    });

    test('starts locked when enabled', () {
      store.enabled = true;
      final service = BiometricService(store, auth);
      expect(service.isEnabled, isTrue);
      expect(service.isLocked, isTrue);
    });

    test('reads and writes the shared preference', () async {
      SharedPreferences.setMockInitialValues({'dayli.biometric_enabled': true});
      final prefs = await SharedPreferences.getInstance();
      final service = BiometricService(
        SharedPreferencesBiometricStore(prefs),
        auth,
      );
      expect(service.isLocked, isTrue);
      await service.unlock();
      expect(await service.setEnabled(false), BiometricResult.success);
      expect(prefs.getBool('dayli.biometric_enabled'), isFalse);
    });
  });

  group('lifecycle', () {
    test('does nothing while disabled', () {
      final service = BiometricService(store, auth);
      service
        ..obscure()
        ..lockForBackground();
      expect(service.isObscured, isFalse);
      expect(service.isLocked, isFalse);
    });

    test(
      'inactive only obscures, and resumed reveals without unlocking',
      () async {
        final service = await unlockedService();
        service.obscure();
        expect(service.isObscured, isTrue);
        expect(service.isLocked, isFalse);
        service.reveal();
        expect(service.isObscured, isFalse);
        expect(service.isLocked, isFalse);
      },
    );

    test(
      'backgrounding locks and asks the lock screen to prompt again',
      () async {
        final service = await unlockedService();
        final generation = service.lockGeneration;
        service.lockForBackground(); // hidden
        expect(service.isLocked, isTrue);
        expect(service.lockGeneration, generation + 1);
        service.lockForBackground(); // paused, same trip
        service.lockForBackground(); // hidden on the way back
        expect(service.lockGeneration, generation + 1);
        service.reveal();
        expect(service.isLocked, isTrue);
        service.lockForBackground(); // the next trip prompts again
        expect(service.lockGeneration, generation + 2);
      },
    );

    test(
      'a background trip with a failed unlock still prompts on return',
      () async {
        store.enabled = true;
        final service = BiometricService(store, auth);
        auth.result = false;
        expect(await service.unlock(), BiometricResult.failed);
        final generation = service.lockGeneration;
        service.lockForBackground();
        expect(service.lockGeneration, greaterThan(generation));
      },
    );
  });

  group('background while a prompt is open', () {
    // Review case: the disable confirmation is open, the user presses Home,
    // and the sticky prompt stays pending through resume.
    test(
      'prompt-generated inactive is ignored, but hidden and paused lock',
      () async {
        final service = await unlockedService();
        final prompt = auth.holdNextPrompt();
        final disabling = service.setEnabled(false);
        await Future<void>.delayed(Duration.zero);
        expect(service.isAuthenticating, isTrue);

        service.obscure(); // inactive from the system prompt
        expect(service.isObscured, isFalse);
        expect(service.isLocked, isFalse);

        service.lockForBackground(); // hidden
        expect(service.isLocked, isTrue);
        service.lockForBackground(); // paused
        service.obscure(); // inactive on the way back
        service.reveal(); // resumed
        expect(service.isLocked, isTrue);

        prompt.complete(false); // cancelled after returning
        expect(await disabling, BiometricResult.failed);
        expect(service.isEnabled, isTrue);
        expect(service.isLocked, isTrue);
      },
    );

    test('a pending prompt does not schedule another prompt', () async {
      final service = await unlockedService();
      final prompt = auth.holdNextPrompt();
      final disabling = service.setEnabled(false);
      await Future<void>.delayed(Duration.zero);
      final generation = service.lockGeneration;

      service.lockForBackground();
      expect(service.lockGeneration, generation);

      prompt.complete(true);
      await disabling;
    });

    test(
      'a pending confirmation that succeeds after returning was the owner',
      () async {
        final service = await unlockedService();
        final prompt = auth.holdNextPrompt();
        final disabling = service.setEnabled(false);
        await Future<void>.delayed(Duration.zero);
        service.lockForBackground();
        expect(service.isLocked, isTrue);

        // The lock screen joins the same prompt instead of opening another.
        final unlocking = service.unlock();
        prompt.complete(true);

        expect(await disabling, BiometricResult.success);
        expect(await unlocking, BiometricResult.success);
        expect(auth.prompts, 1);
        expect(service.isEnabled, isFalse);
        expect(service.isLocked, isFalse);
      },
    );
  });

  group('unlock', () {
    test('shares one prompt between concurrent callers', () async {
      store.enabled = true;
      final service = BiometricService(store, auth);
      final prompt = auth.holdNextPrompt();
      final first = service.unlock();
      final second = service.unlock();
      await Future<void>.delayed(Duration.zero);
      prompt.complete(true);
      expect(await first, BiometricResult.success);
      expect(await second, BiometricResult.success);
      expect(auth.prompts, 1);
      expect(service.isLocked, isFalse);
    });

    test('does not prompt when already unlocked', () async {
      final service = await unlockedService();
      expect(await service.unlock(), BiometricResult.success);
      expect(auth.prompts, 0);
    });

    test('stays locked when authentication fails or throws', () async {
      store.enabled = true;
      final service = BiometricService(store, auth);
      auth.result = false;
      expect(await service.unlock(), BiometricResult.failed);
      auth.error = PlatformException(code: 'UserCancelled');
      expect(await service.unlock(), BiometricResult.failed);
      expect(service.isLocked, isTrue);
    });

    test('reports unavailable without prompting when the device has no '
        'authentication', () async {
      store.enabled = true;
      final service = BiometricService(store, auth);
      auth
        ..biometricsAvailable = false
        ..deviceSupported = false;
      expect(await service.unlock(), BiometricResult.unavailable);
      expect(auth.prompts, 0);
      expect(service.isLocked, isTrue);
    });

    test('reports unavailable when the plugin rejects the prompt', () async {
      store.enabled = true;
      final service = BiometricService(store, auth);
      auth.error = PlatformException(code: 'PasscodeNotSet');
      expect(await service.unlock(), BiometricResult.unavailable);
      expect(service.isLocked, isTrue);
    });
  });

  test('maps the stable local_auth error codes', () {
    for (final code in [
      'NotAvailable',
      'NotEnrolled',
      'PasscodeNotSet',
      'OtherOperatingSystem',
      'BiometricNotAvailable',
    ]) {
      expect(
        BiometricService.resultForErrorCode(code),
        BiometricResult.unavailable,
        reason: code,
      );
    }
    for (final code in ['LockedOut', 'PermanentlyLockedOut']) {
      expect(
        BiometricService.resultForErrorCode(code),
        BiometricResult.lockedOut,
        reason: code,
      );
    }
    for (final code in [
      'UserCancelled',
      'UserFallback',
      'auth_in_progress',
      'no_activity',
      'something-new',
    ]) {
      expect(
        BiometricService.resultForErrorCode(code),
        BiometricResult.failed,
        reason: code,
      );
    }
  });

  group('setEnabled', () {
    test('enabling fails if the device has no authentication', () async {
      final service = BiometricService(store, auth);
      auth
        ..biometricsAvailable = false
        ..deviceSupported = false;
      expect(await service.setEnabled(true), BiometricResult.unavailable);
      expect(service.isEnabled, isFalse);
      expect(store.enabled, isFalse);
    });

    test('enabling prompts and succeeds without locking', () async {
      final service = BiometricService(store, auth);
      expect(await service.setEnabled(true), BiometricResult.success);
      expect(service.isEnabled, isTrue);
      expect(service.isLocked, isFalse);
      expect(auth.reasons.single, BiometricService.enableReason);
      expect(store.enabled, isTrue);
    });

    test('enabling fails if authentication fails', () async {
      final service = BiometricService(store, auth);
      auth.result = false;
      expect(await service.setEnabled(true), BiometricResult.failed);
      expect(service.isEnabled, isFalse);
    });

    test('disabling prompts and succeeds', () async {
      final service = await unlockedService();
      expect(await service.setEnabled(false), BiometricResult.success);
      expect(service.isEnabled, isFalse);
      expect(service.isLocked, isFalse);
      expect(auth.reasons.single, BiometricService.disableReason);
      expect(store.enabled, isFalse);
    });

    test('disabling fails if authentication fails', () async {
      final service = await unlockedService();
      auth.result = false;
      expect(await service.setEnabled(false), BiometricResult.failed);
      expect(service.isEnabled, isTrue);
      expect(store.enabled, isTrue);
    });

    test(
      'disabling reports unavailable once device authentication is removed',
      () async {
        final service = await unlockedService();
        auth.removeDeviceAuthentication();
        expect(await service.setEnabled(false), BiometricResult.unavailable);
        expect(service.isEnabled, isTrue);
      },
    );

    test('ignores a second change while a prompt is open', () async {
      final service = BiometricService(store, auth);
      final prompt = auth.holdNextPrompt();
      final first = service.setEnabled(true);
      await Future<void>.delayed(Duration.zero);
      expect(await service.setEnabled(true), BiometricResult.failed);
      prompt.complete(true);
      expect(await first, BiometricResult.success);
      expect(auth.prompts, 1);
    });
  });

  group('recoverWithAccount', () {
    test('signs out, keeps the draft, then turns the lock off', () async {
      final harness = TestHarness();
      harness.biometricPreference.enabled = true;
      await harness.session.signIn(
        email: 'jos@example.test',
        password: 'correct-password',
      );
      harness.drafts.drafts['user-1'] = DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-25',
        promptId: 'p1',
        promptText: 'What made today?',
        idempotencyKey: 'k1',
        updatedAt: DateTime.utc(2026, 9, 25),
      );
      harness.localAuth.removeDeviceAuthentication();
      final service = harness.biometric;
      expect(await service.unlock(), BiometricResult.unavailable);

      expect(await service.recoverWithAccount(harness.session), isTrue);

      expect(harness.session.status, SessionStatus.signedOut);
      expect(harness.tokens.value, isNull);
      expect(harness.drafts.drafts, contains('user-1'));
      expect(service.isEnabled, isFalse);
      expect(service.isLocked, isFalse);
      expect(harness.biometricPreference.enabled, isFalse);
    });

    test('keeps the lock on when sign-out fails', () async {
      final tokens = FailingClearTokenStore();
      final session = SessionController(
        session: BetterAuthNativeSession(
          baseUrl: 'https://api.example.test',
          tokenStore: tokens,
          client: MockClient((_) async => http.Response('{}', 200)),
        ),
        tokenStore: tokens,
        userCache: MemoryUserCache(),
        drafts: MemoryDraftStore(),
      );
      store.enabled = true;
      final service = BiometricService(store, auth);

      await expectLater(
        service.recoverWithAccount(session),
        throwsA(isA<StateError>()),
      );
      expect(service.isEnabled, isTrue);
      expect(service.isLocked, isTrue);
      expect(store.enabled, isTrue);
    });
  });
}

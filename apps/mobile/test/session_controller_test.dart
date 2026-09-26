import 'package:dayli_mobile/app/fresh_install.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/fakes.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('signs in, restores, and signs out while removing the draft', () async {
    final harness = TestHarness();
    await harness.session.restore();
    expect(harness.session.status, SessionStatus.signedOut);

    await harness.session.signIn(
      email: 'jos@example.test',
      password: 'correct-password',
    );
    expect(harness.session.user?.id, 'user-1');
    await harness.drafts.write(
      DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-25',
        promptId: 'p',
        promptText: 't',
        idempotencyKey: 'k',
        updatedAt: DateTime.utc(2026),
      ),
    );

    await harness.session.signOut();
    expect(harness.session.status, SessionStatus.signedOut);
    expect(harness.tokens.value, isNull);
    expect(harness.users.value, isNull);
    expect(harness.drafts.drafts, isEmpty);
  });

  test('rejects a wrong password without storing a token', () async {
    final harness = TestHarness();
    await expectLater(
      harness.session.signIn(email: 'jos@example.test', password: 'wrong'),
      throwsA(isA<AuthenticationFailure>()),
    );
    expect(harness.tokens.value, isNull);
  });

  test('clears a stored session the server no longer accepts', () async {
    final harness = TestHarness();
    harness.tokens.value = 'revoked';
    harness.users.value = const SessionUser(id: 'user-1', name: '', email: '');
    await harness.session.restore();

    expect(harness.session.status, SessionStatus.signedOut);
    expect(harness.tokens.value, isNull);
  });

  test('wipes protected storage once after a fresh install', () async {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({
      'dayli.auth.session-token': 'old',
    });
    const storage = FlutterSecureStorage();

    await clearProtectedStorageAfterReinstall(
      preferences: SharedPreferences.getInstance(),
      secureStorage: storage,
    );
    expect(await storage.read(key: 'dayli.auth.session-token'), isNull);

    await storage.write(key: 'dayli.auth.session-token', value: 'new');
    await clearProtectedStorageAfterReinstall(
      preferences: SharedPreferences.getInstance(),
      secureStorage: storage,
    );
    expect(await storage.read(key: 'dayli.auth.session-token'), 'new');
  });
}

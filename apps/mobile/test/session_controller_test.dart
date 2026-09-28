import 'package:dayli_mobile/app/fresh_install.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'dart:convert';

import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
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

  test(
    'fails closed before an account switch can replace Alice push credentials',
    () async {
      final tokens = MemoryTokenStore()..value = 'alice-token';
      final users = MemoryUserCache();
      final drafts = MemoryDraftStore();
      var signInCalls = 0;
      final native = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokens,
        client: MockClient((request) async {
          if (request.url.path.endsWith('/get-session')) {
            return http.Response(
              jsonEncode({
                'user': {
                  'id': 'alice',
                  'name': 'Alice',
                  'email': 'alice@example.test',
                },
              }),
              200,
            );
          }
          if (request.url.path.endsWith('/sign-in/email')) {
            signInCalls++;
            return http.Response(
              '{}',
              200,
              headers: {'set-auth-token': 'bob-token'},
            );
          }
          return http.Response('{}', 404);
        }),
      );
      String? cleanupToken;
      final controller = SessionController(
        session: native,
        tokenStore: tokens,
        userCache: users,
        drafts: drafts,
        onBeforeSessionReplacement: () async {
          cleanupToken = await tokens.read();
          throw StateError('push cleanup is offline');
        },
      );
      await controller.restore();
      await expectLater(
        controller.signIn(
          email: 'bob@example.test',
          password: 'correct-password',
        ),
        throwsA(isA<StateError>()),
      );
      expect(cleanupToken, 'alice-token');
      expect(signInCalls, 0);
      expect(tokens.value, 'alice-token');
    },
  );

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

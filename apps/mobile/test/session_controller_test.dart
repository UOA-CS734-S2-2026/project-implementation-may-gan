import 'dart:async';

import 'package:dayli_mobile/app/fresh_install.dart';
import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'dart:convert';

import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/messaging/messaging_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'messaging_controller_test.dart' show FakeMessagingClient;
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

  test(
    'offline cached restore starts realtime once and lets it recover',
    () async {
      final tokens = MemoryTokenStore()..value = 'cached-token';
      final users = MemoryUserCache()
        ..value = const SessionUser(
          id: 'cached-user',
          name: 'Cached',
          email: 'cached@example.test',
        );
      final client = FakeMessagingClient();
      final messaging = MessagingController(client);
      final session = SessionController(
        session: BetterAuthNativeSession(
          baseUrl: 'https://api.example.test',
          tokenStore: tokens,
          client: MockClient(
            (_) async => throw http.ClientException('offline'),
          ),
        ),
        tokenStore: tokens,
        userCache: users,
        drafts: MemoryDraftStore(),
        onSignedIn: (_) => messaging.startRealtime(),
        onPrivateDataClear: messaging.stopRealtime,
      );

      await session.restore();
      expect(session.status, SessionStatus.signedIn);
      expect(client.ticketCalls, 1);
      await session.restore();
      expect(client.ticketCalls, 1);
      await messaging.foreground();
      expect(client.ticketCalls, 2);
      await session.signOut();
      expect(session.status, SessionStatus.signedOut);
    },
  );

  test(
    'logout racing session startup cannot restore signed-in state',
    () async {
      final tokens = MemoryTokenStore()..value = 'cached-token';
      final users = MemoryUserCache()
        ..value = const SessionUser(
          id: 'alice',
          name: 'Alice',
          email: 'a@test',
        );
      final startup = Completer<void>();
      final lateStartupEffects = <String>[];
      final session = SessionController(
        session: BetterAuthNativeSession(
          baseUrl: 'https://api.example.test',
          tokenStore: tokens,
          client: MockClient(
            (_) async => throw http.ClientException('offline'),
          ),
        ),
        tokenStore: tokens,
        userCache: users,
        drafts: MemoryDraftStore(),
        onSignedIn: (sessionStartup) async {
          await startup.future;
          if (sessionStartup.isCurrent) {
            lateStartupEffects.add(sessionStartup.user.id);
          }
        },
      );
      final restoring = session.restore();
      await Future<void>.delayed(Duration.zero);
      await session.signOut();
      startup.complete();
      await restoring;
      expect(session.status, SessionStatus.signedOut);
      expect(session.user, isNull);
      expect(lateStartupEffects, isEmpty);
    },
  );

  test('late Alice startup is fenced before Bob session startup', () async {
    final tokens = MemoryTokenStore()..value = 'alice-token';
    final users = MemoryUserCache()
      ..value = const SessionUser(
        id: 'alice',
        name: 'Alice',
        email: 'alice@example.test',
      );
    var offline = true;
    final aliceStartup = Completer<void>();
    final activeStarts = <String>[];
    final session = SessionController(
      session: BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokens,
        client: MockClient((request) async {
          if (request.url.path.endsWith('/get-session')) {
            if (offline) throw http.ClientException('offline');
            return http.Response(
              jsonEncode({
                'user': {
                  'id': 'bob',
                  'name': 'Bob',
                  'email': 'bob@example.test',
                },
              }),
              200,
            );
          }
          if (request.url.path.endsWith('/sign-in/email')) {
            offline = false;
            return http.Response(
              '{}',
              200,
              headers: {'set-auth-token': 'bob-token'},
            );
          }
          return http.Response('{}', 404);
        }),
      ),
      tokenStore: tokens,
      userCache: users,
      drafts: MemoryDraftStore(),
      onBeforeSessionReplacement: () async {},
      onSignedIn: (startup) async {
        if (startup.user.id == 'alice') await aliceStartup.future;
        if (startup.isCurrent) activeStarts.add(startup.user.id);
      },
    );

    final restoringAlice = session.restore();
    await Future<void>.delayed(Duration.zero);
    await session.signIn(
      email: 'bob@example.test',
      password: 'correct-password',
    );
    expect(activeStarts, ['bob']);
    aliceStartup.complete();
    await restoringAlice;
    expect(activeStarts, ['bob']);
    expect(session.user?.id, 'bob');
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

import 'dart:convert';

import 'package:dayli_mobile/auth/native_session.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeGoogleIdTokenProvider implements GoogleIdTokenProvider {
  FakeGoogleIdTokenProvider(this.token);

  final String token;

  @override
  Future<String> authenticate() async => token;
}

class MemorySessionTokenStore implements SessionTokenStore {
  String? value;

  @override
  Future<void> clear() async {
    value = null;
  }

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String token) async {
    value = token;
  }
}

void main() {
  test(
    'persists Better Auth handoff tokens and sends them as bearer sessions',
    () async {
      final tokenStore = MemorySessionTokenStore();
      late http.Request sessionRequest;
      final client = MockClient((request) async {
        if (request.url.path.endsWith('/sign-in/email')) {
          return http.Response(
            '',
            200,
            headers: {'set-auth-token': 'worker-token'},
          );
        }
        sessionRequest = request;
        return http.Response('{}', 200);
      });
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokenStore,
        client: client,
      );

      await session.signIn(
        email: 'mobile@example.test',
        password: 'not-a-real-password',
      );
      await session.getSession();

      expect(tokenStore.value, 'worker-token');
      expect(sessionRequest.headers['authorization'], 'Bearer worker-token');
    },
  );

  test(
    'exchanges a Google SDK ID token for the existing native session handoff',
    () async {
      final tokenStore = MemorySessionTokenStore();
      late Map<String, dynamic> signInBody;
      final client = MockClient((request) async {
        signInBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response(
          '',
          200,
          headers: {'set-auth-token': 'worker-token'},
        );
      });
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokenStore,
        client: client,
      );

      await session.signInWithGoogle(
        FakeGoogleIdTokenProvider('google-id-token'),
      );

      expect(tokenStore.value, 'worker-token');
      expect(signInBody, {
        'provider': 'google',
        'idToken': {'token': 'google-id-token'},
      });
    },
  );

  test('does not persist a token when Google sign-in is rejected', () async {
    final tokenStore = MemorySessionTokenStore();
    final client = MockClient((request) async => http.Response('', 401));
    final session = BetterAuthNativeSession(
      baseUrl: 'https://api.example.test',
      tokenStore: tokenStore,
      client: client,
    );

    await expectLater(
      session.signInWithGoogle(
        FakeGoogleIdTokenProvider('invalid-google-id-token'),
      ),
      throwsA(isA<AuthenticationFailure>()),
    );
    expect(tokenStore.value, isNull);
  });

  test(
    'clears the protected token only after Better Auth confirms logout',
    () async {
      final tokenStore = MemorySessionTokenStore()..value = 'worker-token';
      final client = MockClient((request) async => http.Response('', 200));
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokenStore,
        client: client,
      );

      await session.signOut();

      expect(tokenStore.value, isNull);
    },
  );

  test(
    'clears a locally stored token after Better Auth reports it revoked',
    () async {
      final tokenStore = MemorySessionTokenStore()..value = 'worker-token';
      final client = MockClient((request) async => http.Response('null', 200));
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokenStore,
        client: client,
      );

      await session.getSession();

      expect(tokenStore.value, isNull);
    },
  );

  test('does not persist a token when Better Auth rejects login', () async {
    final tokenStore = MemorySessionTokenStore();
    final client = MockClient((request) async => http.Response('', 401));
    final session = BetterAuthNativeSession(
      baseUrl: 'https://api.example.test',
      tokenStore: tokenStore,
      client: client,
    );

    await expectLater(
      session.signIn(
        email: 'mobile@example.test',
        password: 'not-a-real-password',
      ),
      throwsA(isA<AuthenticationFailure>()),
    );
    expect(tokenStore.value, isNull);
  });
}

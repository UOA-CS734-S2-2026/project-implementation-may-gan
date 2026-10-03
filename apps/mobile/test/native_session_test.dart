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
  String? pendingRevocation;

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

  @override
  Future<String?> readPendingRevocation() async => pendingRevocation;

  @override
  Future<void> clearPendingRevocation() async => pendingRevocation = null;

  @override
  Future<void> quarantineActiveToken() async {
    final token = value;
    if (token == null) return;
    pendingRevocation = token;
    value = null;
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

  test('does not expose a quarantined bearer to normal API calls', () async {
    final tokenStore = MemorySessionTokenStore()
      ..value = 'stale-active-copy'
      ..pendingRevocation = 'alice-revoke-token';
    var requests = 0;
    final session = BetterAuthNativeSession(
      baseUrl: 'https://api.example.test',
      tokenStore: tokenStore,
      client: MockClient((_) async {
        requests++;
        return http.Response('{}', 200);
      }),
    );

    expect(await session.bearerToken(), isNull);
    expect(await session.currentUser(), isNull);
    await expectLater(
      session.signIn(email: 'bob@example.test', password: 'password'),
      throwsA(isA<AuthenticationFailure>()),
    );
    expect(requests, 0);
  });

  test(
    'signs up with the required username and optional public name',
    () async {
      final tokenStore = MemorySessionTokenStore();
      late Map<String, dynamic> signUpBody;
      final client = MockClient((request) async {
        expect(request.url.path, '/api/auth/sign-up/email');
        signUpBody = jsonDecode(request.body) as Map<String, dynamic>;
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

      await session.signUp(
        name: 'Mobile User',
        username: 'mobile_user',
        publicName: 'Mobile User',
        email: 'mobile@example.test',
        password: 'not-a-real-password',
      );

      expect(tokenStore.value, 'worker-token');
      expect(signUpBody, {
        'name': 'Mobile User',
        'username': 'mobile_user',
        'displayUsername': 'Mobile User',
        'email': 'mobile@example.test',
        'password': 'not-a-real-password',
      });
    },
  );

  test(
    'requests the exact current version after the explicit action and sends one-use headers for email and Google',
    () async {
      final tokenStore = MemorySessionTokenStore();
      final requests = <http.Request>[];
      const digest =
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const token =
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const binding =
          'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokenStore,
        client: MockClient((request) async {
          requests.add(request);
          if (request.url.path.endsWith('/legal/current')) {
            return http.Response(
              jsonEncode({
                'status': 'effective',
                'termsVersionId': 'terms-v1',
                'termsContentDigest': digest,
                'ageDeclarationVersion': 'age-16-v1',
              }),
              200,
            );
          }
          if (request.url.path.endsWith('/registration-intent')) {
            final payload = jsonDecode(request.body) as Map<String, dynamic>;
            expect(payload['termsVersionId'], 'terms-v1');
            expect(payload['termsContentDigest'], digest);
            expect(payload['acceptedTermsAndDeclaredAge16'], true);
            expect(payload['flow'], anyOf('email', 'google_native'));
            return http.Response(
              jsonEncode({
                'termsVersionId': 'terms-v1',
                'token': token,
                'binding': binding,
                'expiresAt': '2026-10-02T01:00:00Z',
              }),
              200,
            );
          }
          return http.Response(
            '{}',
            200,
            headers: {'set-auth-token': 'session-token'},
          );
        }),
      );
      final terms = await session.currentRegistrationTerms();
      final emailProof = await session.issueRegistrationProof(
        flow: 'email',
        terms: terms,
      );
      await session.signUp(
        name: 'Mobile User',
        username: 'mobile_user',
        publicName: null,
        email: 'mobile@example.test',
        password: 'not-a-real-password',
        registrationProof: emailProof,
      );
      final googleProof = await session.issueRegistrationProof(
        flow: 'google_native',
        terms: terms,
      );
      await session.signInWithGoogle(
        FakeGoogleIdTokenProvider('google-id-token'),
        registrationProof: googleProof,
      );
      for (final request in requests.where(
        (request) =>
            request.url.path.endsWith('/sign-up/email') ||
            request.url.path.endsWith('/sign-in/social'),
      )) {
        expect(request.headers['x-dayli-registration-intent'], token);
        expect(request.headers['x-dayli-registration-binding'], binding);
        expect(request.body, isNot(contains(token)));
      }
    },
  );

  test(
    'rejects a changed or invalid proof before creating a native account',
    () async {
      final requests = <http.Request>[];
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: MemorySessionTokenStore(),
        client: MockClient((request) async {
          requests.add(request);
          return http.Response(
            '{"termsVersionId":"stale","token":"invalid","binding":"invalid"}',
            200,
          );
        }),
      );
      await expectLater(
        session.issueRegistrationProof(
          flow: 'email',
          terms: const RegistrationTerms(
            versionId: 'current',
            contentDigest: 'a',
          ),
        ),
        throwsA(isA<AuthenticationFailure>()),
      );
      expect(
        requests.where(
          (request) => request.url.path.endsWith('/sign-up/email'),
        ),
        isEmpty,
      );
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

  test(
    'identifies only an unlinked Google account for password sign-in guidance',
    () async {
      final tokenStore = MemorySessionTokenStore();
      final client = MockClient(
        (request) async => http.Response(
          jsonEncode({
            'code': 'OAUTH_LINK_ERROR',
            'message': 'account not linked',
          }),
          401,
          headers: {'content-type': 'application/json'},
        ),
      );
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokenStore,
        client: client,
      );

      await expectLater(
        session.signInWithGoogle(FakeGoogleIdTokenProvider('google-id-token')),
        throwsA(
          isA<AuthenticationFailure>().having(
            (failure) => failure.needsGoogleLink,
            'needsGoogleLink',
            isTrue,
          ),
        ),
      );
      expect(tokenStore.value, isNull);
      expect(
        const AuthenticationFailure(
          'google-sign-in',
          401,
          code: 'OAUTH_LINK_ERROR',
          message: 'account already linked',
        ).needsGoogleLink,
        isFalse,
      );
    },
  );

  test(
    'links Google with the current password over the existing bearer session',
    () async {
      final tokenStore = MemorySessionTokenStore()..value = 'worker-token';
      late Map<String, dynamic> linkBody;
      late http.Request linkRequest;
      final client = MockClient((request) async {
        linkRequest = request;
        linkBody = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response('', 200);
      });
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokenStore,
        client: client,
      );

      await session.linkGoogle(
        provider: FakeGoogleIdTokenProvider('google-id-token'),
        password: 'current-password',
      );

      expect(linkRequest.url.path, '/api/auth/link-social');
      expect(linkRequest.headers['authorization'], 'Bearer worker-token');
      expect(linkBody, {
        'provider': 'google',
        'password': 'current-password',
        'idToken': {'token': 'google-id-token'},
      });
      expect(tokenStore.value, 'worker-token');
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
      final client = MockClient((request) async {
        expect(request.headers['content-type'], 'application/json');
        expect(request.headers['authorization'], 'Bearer worker-token');
        expect(request.body, '{}');
        return http.Response('', 200);
      });
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
    'revokes a quarantined bearer with the Better Auth JSON request',
    () async {
      final tokenStore = MemorySessionTokenStore()
        ..pendingRevocation = 'quarantined-token';
      final client = MockClient((request) async {
        expect(request.url.path, '/api/auth/sign-out');
        expect(request.headers['content-type'], 'application/json');
        expect(request.headers['authorization'], 'Bearer quarantined-token');
        expect(request.body, '{}');
        return http.Response('', 200);
      });
      final session = BetterAuthNativeSession(
        baseUrl: 'https://api.example.test',
        tokenStore: tokenStore,
        client: client,
      );

      await session.revokePendingSession();

      expect(tokenStore.pendingRevocation, isNull);
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

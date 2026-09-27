import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:http/http.dart' as http;

const _sessionTokenKey = 'dayli.auth.session-token';

abstract interface class SessionTokenStore {
  Future<void> clear();
  Future<String?> read();
  Future<void> write(String token);
}

class ProtectedSessionTokenStore implements SessionTokenStore {
  ProtectedSessionTokenStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(),
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.unlocked_this_device,
            ),
          );

  final FlutterSecureStorage _storage;

  @override
  Future<void> clear() => _storage.delete(key: _sessionTokenKey);

  @override
  Future<String?> read() => _storage.read(key: _sessionTokenKey);

  @override
  Future<void> write(String token) =>
      _storage.write(key: _sessionTokenKey, value: token);
}

abstract interface class GoogleIdTokenProvider {
  Future<String> authenticate();
}

/// Obtains a short-lived Google ID token for Better Auth. No Google API scope
/// is requested, and the token is immediately exchanged for a Dayli session.
class FlutterGoogleIdTokenProvider implements GoogleIdTokenProvider {
  FlutterGoogleIdTokenProvider({
    required String webClientId,
    required String iosClientId,
  }) : _initialize = GoogleSignIn.instance.initialize(
         clientId: iosClientId.isEmpty ? null : iosClientId,
         serverClientId: webClientId,
       );

  final Future<void> _initialize;

  @override
  Future<String> authenticate() async {
    await _initialize;
    if (!GoogleSignIn.instance.supportsAuthenticate()) {
      throw const AuthenticationFailure('google-sign-in', 501);
    }
    final account = await GoogleSignIn.instance.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw const AuthenticationFailure('google-sign-in', 401);
    }
    return idToken;
  }
}

class AuthenticationFailure implements Exception {
  const AuthenticationFailure(this.operation, this.statusCode);

  final String operation;
  final int statusCode;

  @override
  String toString() => 'AuthenticationFailure($operation, $statusCode)';
}

class SessionUser {
  const SessionUser({
    required this.id,
    required this.name,
    required this.email,
  });

  final String id;
  final String name;
  final String email;
}

class BetterAuthNativeSession {
  BetterAuthNativeSession({
    required String baseUrl,
    required SessionTokenStore tokenStore,
    http.Client? client,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
       _client = client ?? http.Client() {
    _tokenStore = tokenStore;
  }

  final String _baseUrl;
  final http.Client _client;
  late final SessionTokenStore _tokenStore;

  Future<void> signIn({required String email, required String password}) async {
    final response = await _client.post(
      _uri('/api/auth/sign-in/email'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    await _storeNativeToken(response, 'sign-in');
  }

  Future<void> signUp({
    required String name,
    required String email,
    required String password,
  }) async {
    final response = await _client.post(
      _uri('/api/auth/sign-up/email'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'name': name, 'email': email, 'password': password}),
    );
    await _storeNativeToken(response, 'sign-up');
  }

  Future<void> signInWithGoogle(GoogleIdTokenProvider provider) async {
    final idToken = await provider.authenticate();
    final response = await _client.post(
      _uri('/api/auth/sign-in/social'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({
        'provider': 'google',
        'idToken': {'token': idToken},
      }),
    );
    await _storeNativeToken(response, 'google-sign-in');
  }

  /// Explicitly links a Google identity to the signed-in password account.
  /// The Worker verifies [password] against the bearer session's user before
  /// it accepts the short-lived Google ID token. This never creates a session.
  Future<void> linkGoogle({
    required GoogleIdTokenProvider provider,
    required String password,
  }) async {
    final bearerToken = await _tokenStore.read();
    if (bearerToken == null) {
      throw const AuthenticationFailure('google-link', 401);
    }
    final idToken = await provider.authenticate();
    final response = await _client.post(
      _uri('/api/auth/link-social'),
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer $bearerToken',
      },
      body: jsonEncode({
        'provider': 'google',
        'password': password,
        'idToken': {'token': idToken},
      }),
    );
    if (response.statusCode >= 400) {
      throw AuthenticationFailure('google-link', response.statusCode);
    }
  }

  Future<http.Response> getSession() async {
    final token = await _tokenStore.read();
    if (token == null) {
      throw const AuthenticationFailure('get-session', 401);
    }

    final response = await _client.get(
      _uri('/api/auth/get-session'),
      headers: {'authorization': 'Bearer $token'},
    );
    if (response.statusCode == 401 || response.body.trim() == 'null') {
      await _tokenStore.clear();
    }
    return response;
  }

  /// The signed-in user, or null when there is no valid session. A missing,
  /// expired, or revoked session clears the stored token.
  Future<SessionUser?> currentUser() async {
    if (await _tokenStore.read() == null) return null;
    final response = await getSession();
    if (response.statusCode == 401) return null;
    if (response.statusCode >= 400) {
      throw AuthenticationFailure('get-session', response.statusCode);
    }
    final body = jsonDecode(response.body);
    if (body is! Map<String, dynamic>) return null;
    final user = body['user'];
    if (user is! Map<String, dynamic>) return null;
    final id = user['id'];
    if (id is! String || id.isEmpty) return null;
    return SessionUser(
      id: id,
      name: user['name'] is String ? user['name'] as String : '',
      email: user['email'] is String ? user['email'] as String : '',
    );
  }

  /// The stored bearer token for application API calls, if any.
  Future<String?> bearerToken() => _tokenStore.read();

  Future<void> signOut() async {
    final token = await _tokenStore.read();
    if (token == null) {
      return;
    }

    final response = await _client.post(
      _uri('/api/auth/sign-out'),
      headers: {'authorization': 'Bearer $token'},
    );
    if (response.statusCode >= 400) {
      throw AuthenticationFailure('sign-out', response.statusCode);
    }
    await _tokenStore.clear();
  }

  Uri _uri(String path) => Uri.parse('$_baseUrl$path');

  Future<void> _storeNativeToken(
    http.Response response,
    String operation,
  ) async {
    if (response.statusCode >= 400) {
      throw AuthenticationFailure(operation, response.statusCode);
    }

    final token = response.headers['set-auth-token'];
    if (token == null || token.isEmpty) {
      throw AuthenticationFailure(operation, response.statusCode);
    }
    await _tokenStore.write(token);
  }
}

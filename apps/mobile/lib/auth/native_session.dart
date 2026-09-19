import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
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

class AuthenticationFailure implements Exception {
  const AuthenticationFailure(this.operation, this.statusCode);

  final String operation;
  final int statusCode;

  @override
  String toString() => 'AuthenticationFailure($operation, $statusCode)';
}

class BetterAuthNativeSession {
  BetterAuthNativeSession({
    required String baseUrl,
    required SessionTokenStore tokenStore,
    http.Client? client,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), ''),
       _client = client ?? http.Client(),
       _tokenStore = tokenStore;

  final String _baseUrl;
  final http.Client _client;
  final SessionTokenStore _tokenStore;

  Future<void> signIn({required String email, required String password}) async {
    final response = await _client.post(
      _uri('/api/auth/sign-in/email'),
      headers: const {'content-type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    await _storeNativeToken(response, 'sign-in');
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

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' show ClientException;

import '../drafts/draft_store.dart';
import 'native_session.dart';

enum SessionStatus { unknown, signedOut, signedIn }

/// Caches the signed-in identity in protected storage so drafts stay
/// available offline. The identity is not a credential; the bearer token is.
abstract interface class SessionUserCache {
  Future<SessionUser?> read();
  Future<void> write(SessionUser user);
  Future<void> clear();
}

class ProtectedSessionUserCache implements SessionUserCache {
  ProtectedSessionUserCache(this._storage);

  static const _key = 'dayli.auth.session-user';
  final FlutterSecureStorage _storage;

  @override
  Future<SessionUser?> read() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return null;
      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic> || json['id'] is! String) return null;
      return SessionUser(
        id: json['id'] as String,
        name: json['name'] is String ? json['name'] as String : '',
        email: json['email'] is String ? json['email'] as String : '',
      );
    } catch (_) {
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(SessionUser user) => _storage.write(
    key: _key,
    value: jsonEncode({'id': user.id, 'name': user.name, 'email': user.email}),
  );

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

class SessionController extends ChangeNotifier {
  SessionController({
    required this._session,
    required this._tokenStore,
    required this._userCache,
    required this._drafts,
  });

  final BetterAuthNativeSession _session;
  final SessionTokenStore _tokenStore;
  final SessionUserCache _userCache;
  final DraftStore _drafts;

  SessionStatus _status = SessionStatus.unknown;
  SessionUser? _user;

  SessionStatus get status => _status;
  SessionUser? get user => _user;

  Future<String?> bearerToken() => _session.bearerToken();

  /// Restores the stored session. When the network is unreachable the cached
  /// identity is used so the author can keep drafting offline.
  Future<void> restore() async {
    final SessionUser? user;
    try {
      user = await _session.currentUser();
    } on Exception catch (error) {
      if (error is AuthenticationFailure && error.statusCode == 401) {
        await _signedOutLocally();
        return;
      }
      if (error is! IOException &&
          error is! ClientException &&
          error is! AuthenticationFailure) {
        rethrow;
      }
      // Offline or a temporary server failure: keep the cached identity.
      final cached = await _tokenStore.read() == null
          ? null
          : await _userCache.read();
      _set(
        cached == null ? SessionStatus.signedOut : SessionStatus.signedIn,
        cached,
      );
      return;
    }
    if (user == null) {
      await _signedOutLocally();
    } else {
      await _signedIn(user);
    }
  }

  Future<void> signIn({required String email, required String password}) async {
    await _session.signIn(email: email, password: password);
    await _afterAuthentication();
  }

  Future<void> signUp({
    required String name,
    required String email,
    required String password,
  }) async {
    await _session.signUp(name: name, email: email, password: password);
    await _afterAuthentication();
  }

  Future<void> signInWithGoogle(GoogleIdTokenProvider provider) async {
    await _session.signInWithGoogle(provider);
    await _afterAuthentication();
  }

  Future<void> linkGoogle({
    required GoogleIdTokenProvider provider,
    required String password,
  }) => _session.linkGoogle(provider: provider, password: password);

  /// Signs out and removes this user's protected draft from the device.
  Future<void> signOut() async {
    final userId = _user?.id;
    try {
      await _session.signOut();
    } catch (_) {
      // Revocation failed (for example offline); the local token is still
      // removed below so this device no longer holds the session.
    }
    if (userId != null) await _drafts.clear(userId);
    await _signedOutLocally();
  }

  /// Called when the API rejects the stored session.
  Future<void> sessionExpired() => _signedOutLocally();

  Future<void> _afterAuthentication() async {
    final user = await _session.currentUser();
    if (user == null) {
      throw const AuthenticationFailure('get-session', 401);
    }
    await _signedIn(user);
  }

  Future<void> _signedIn(SessionUser user) async {
    await _userCache.write(user);
    _set(SessionStatus.signedIn, user);
  }

  Future<void> _signedOutLocally() async {
    await _tokenStore.clear();
    await _userCache.clear();
    _set(SessionStatus.signedOut, null);
  }

  void _set(SessionStatus status, SessionUser? user) {
    _status = status;
    _user = user;
    notifyListeners();
  }
}

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' show ClientException;

import '../drafts/draft_store.dart';
import 'native_session.dart';

enum SessionStatus { unknown, signedOut, signedIn }

/// A capability passed to async startup work. It becomes invalid before old
/// credentials are replaced or cleared, so late startup cannot affect a new
/// account.
class SessionStartup {
  const SessionStartup._(this.user, this.epoch, this._isCurrent);

  final SessionUser user;
  final int epoch;
  final bool Function() _isCurrent;

  bool get isCurrent => _isCurrent();
}

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
    this.onPrivateDataClear,
    this.onBeforeSessionReplacement,
    this.onSignedIn,
  });

  final BetterAuthNativeSession _session;
  final SessionTokenStore _tokenStore;
  final SessionUserCache _userCache;
  final DraftStore _drafts;

  /// Closes sockets and clears messaging caches before account state changes.
  final FutureOr<void> Function()? onPrivateDataClear;

  /// Runs under the old bearer before sign-in can replace it. A failure aborts
  /// account switching, preventing the old account's push registration from
  /// remaining on a shared device.
  final FutureOr<void> Function()? onBeforeSessionReplacement;

  /// Starts session-bound integrations such as push after verified sign-in.
  final FutureOr<void> Function(SessionStartup startup)? onSignedIn;

  SessionStatus _status = SessionStatus.unknown;
  SessionUser? _user;
  String? _startedSessionUserId;
  int _sessionGeneration = 0;

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
      if (cached == null) {
        _set(SessionStatus.signedOut, null);
      } else {
        // A cached authenticated identity still needs the foreground socket.
        // Its ticket request will reconnect with backoff when the network returns.
        await _signedIn(cached, persistUser: false);
      }
      return;
    }
    if (user == null) {
      await _signedOutLocally();
    } else {
      await _signedIn(user);
    }
  }

  Future<void> signIn({required String email, required String password}) async {
    await _beforeCredentialReplacement();
    await _session.signIn(email: email, password: password);
    await _afterAuthentication();
  }

  Future<void> signUp({
    required String name,
    required String email,
    required String password,
  }) async {
    await _beforeCredentialReplacement();
    await _session.signUp(name: name, email: email, password: password);
    await _afterAuthentication();
  }

  Future<void> signInWithGoogle(GoogleIdTokenProvider provider) async {
    await _beforeCredentialReplacement();
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
    // Fence a late authenticated startup before its cleanup awaits.
    _invalidateSessionStartup();
    try {
      await onPrivateDataClear?.call();
      await _session.signOut();
    } catch (_) {
      // Revocation failed (for example offline); the local token is still
      // removed below so this device no longer holds the session.
    }
    if (userId != null) await _drafts.clear(userId);
    await _signedOutLocally(clearPrivateData: false);
  }

  /// Called when the API rejects the stored session.
  Future<void> sessionExpired() => _signedOutLocally();

  Future<void> _beforeCredentialReplacement() async {
    // Fence existing startup before old-bearer cleanup. The hook can await
    // ticket, Firebase, or provider work and must not resume for the new user.
    _invalidateSessionStartup();
    if (_user != null) await onBeforeSessionReplacement?.call();
  }

  Future<void> _afterAuthentication() async {
    final user = await _session.currentUser();
    if (user == null) {
      throw const AuthenticationFailure('get-session', 401);
    }
    await _signedIn(user);
  }

  Future<void> _signedIn(SessionUser user, {bool persistUser = true}) async {
    // Interactive account replacement already completed its private cleanup
    // under the old bearer in _beforeCredentialReplacement.
    if (persistUser) await _userCache.write(user);
    _set(SessionStatus.signedIn, user);
    if (_startedSessionUserId == user.id) return;
    _startedSessionUserId = user.id;
    final generation = _sessionGeneration;
    final startup = SessionStartup._(
      user,
      generation,
      () => _sessionGeneration == generation && _user?.id == user.id,
    );
    try {
      await onSignedIn?.call(startup);
    } catch (_) {
      // Notification setup must not turn a valid authentication into failure.
    }
    // A sign-out while startup was awaiting must not mark a later account as
    // started. Its own successful authentication will run its own hook.
    if (generation != _sessionGeneration) return;
  }

  Future<void> _signedOutLocally({bool clearPrivateData = true}) async {
    _invalidateSessionStartup();
    if (clearPrivateData) await onPrivateDataClear?.call();
    await _tokenStore.clear();
    await _userCache.clear();
    _set(SessionStatus.signedOut, null);
  }

  void _invalidateSessionStartup() {
    _sessionGeneration++;
    _startedSessionUserId = null;
  }

  void _set(SessionStatus status, SessionUser? user) {
    _status = status;
    _user = user;
    notifyListeners();
  }
}

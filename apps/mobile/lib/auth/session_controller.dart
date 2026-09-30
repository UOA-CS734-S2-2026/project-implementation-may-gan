import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' show ClientException;

import '../drafts/draft_store.dart';
import '../legal/legal_service.dart';
import 'native_session.dart';

enum SessionStatus { unknown, signedOut, needsUsernameSetup, legalRestricted, signedIn }

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
        username: json['username'] is String
            ? json['username'] as String
            : null,
      );
    } catch (_) {
      await clear();
      return null;
    }
  }

  @override
  Future<void> write(SessionUser user) => _storage.write(
    key: _key,
    value: jsonEncode({
      'id': user.id,
      'name': user.name,
      'email': user.email,
      'username': user.username,
    }),
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
    this.legal,
  });

  final BetterAuthNativeSession _session;
  final SessionTokenStore _tokenStore;
  final SessionUserCache _userCache;
  final DraftStore _drafts;
  final LegalService? legal;
  AccountPolicySnapshot? _accountPolicy;

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
  AccountPolicySnapshot? get accountPolicy => _accountPolicy;

  Future<String?> bearerToken() => _session.bearerToken();

  /// Restores the stored session. When the network is unreachable the cached
  /// identity is used so the author can keep drafting offline.
  Future<void> restore() async {
    // A crash-safe revocation quarantine must never be used for ordinary
    // get-session, REST, socket, or push startup on a fresh process.
    if (await _tokenStore.readPendingRevocation() != null) {
      _invalidateSessionStartup();
      await _clearLocalSessionState(clearToken: false);
      return;
    }
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
    required String username,
    required String? publicName,
    required String email,
    required String password,
    CanonicalTerms? terms,
  }) async {
    final client = legal;
    await _beforeCredentialReplacement();
    LegalRegistrationIntent? intent;
    if (client != null) {
      if (terms == null) throw const LegalFailure('Read the current Terms, then confirm both declarations.');
      intent = await client.issueIntent('email');
      if (intent.terms.id != terms.id || intent.terms.contentDigest != terms.contentDigest) {
        throw const LegalFailure('The Terms changed. Read the current version.');
      }
    }
    await _session.signUp(
      name: name,
      username: username,
      publicName: publicName,
      email: email,
      password: password,
      registrationIntent: intent,
    );
    await _afterAuthentication();
  }

  Future<void> completeUsernameSetup({
    required String username,
    required String publicName,
  }) async {
    await _session.claimInitialUsername(
      username: username,
      publicName: publicName,
    );
    final user = _user;
    if (user == null) throw const AuthenticationFailure('username-setup', 401);
    final completed = SessionUser(
      id: user.id,
      name: user.name,
      email: user.email,
      username: username,
    );
    await _userCache.write(completed);
    _set(SessionStatus.signedIn, completed);
  }

  Future<void> signInWithGoogle(
    GoogleIdTokenProvider provider, {
    CanonicalTerms? registrationTerms,
  }) async {
    await _beforeCredentialReplacement();
    LegalRegistrationIntent? intent;
    if (registrationTerms != null) {
      final client = legal;
      if (client == null) throw const LegalFailure('Legal registration is unavailable.');
      intent = await client.issueIntent('google_native');
      if (intent.terms.id != registrationTerms.id ||
          intent.terms.contentDigest != registrationTerms.contentDigest) {
        throw const LegalFailure('The Terms changed. Read the current version.');
      }
    }
    await _session.signInWithGoogle(provider, registrationIntent: intent);
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
    // Cleanup and revocation are intentionally independent. A failed push
    // cleanup must never suppress the old-session revoke attempt.
    try {
      await onPrivateDataClear?.call();
    } catch (_) {}
    var revokeFailed = false;
    try {
      await _session.signOut();
    } catch (_) {
      revokeFailed = true;
      // Preserve this bearer only in quarantine so a later credential change
      // must retry its revoke before it can authenticate anyone else.
      await _tokenStore.quarantineActiveToken();
    }
    if (userId != null) await _drafts.clear(userId);
    await _signedOutLocally(clearPrivateData: false, clearToken: !revokeFailed);
  }

  /// Called when the API rejects the stored session.
  Future<void> sessionExpired() => _signedOutLocally();

  Future<void> _beforeCredentialReplacement() async {
    // Fence existing startup before old-bearer cleanup. The hook can await
    // ticket, Firebase, or provider work and must not resume for the new user.
    _invalidateSessionStartup();
    final pendingRevocation = await _tokenStore.readPendingRevocation();
    final hasOldToken = await _tokenStore.read() != null;
    Object? failure;
    StackTrace? stackTrace;

    if (pendingRevocation != null || hasOldToken || _user != null) {
      try {
        await onBeforeSessionReplacement?.call();
      } catch (error, trace) {
        failure = error;
        stackTrace = trace;
      }
    }
    if (pendingRevocation != null) {
      // This is the sole code path that may use a quarantined bearer.
      try {
        await _session.revokePendingSession();
        // Remove a stale active copy left by a crash between quarantining and
        // deleting the normal token key.
        await _tokenStore.clear();
      } catch (error, trace) {
        failure ??= error;
        stackTrace ??= trace;
      }
    } else if (hasOldToken) {
      // Revoke under the old bearer before any sign-in endpoint can store a
      // replacement token. A tardy old push registration is then rejected by
      // the backend's live-session dispatch check.
      try {
        await _session.signOut();
      } catch (error, trace) {
        failure ??= error;
        stackTrace ??= trace;
        // Persist the quarantine before removing active credentials. Normal
        // auth readers gate on its presence even if a crash interrupts clear.
        await _tokenStore.quarantineActiveToken();
      }
    }
    if (failure != null) {
      // The app remains locally signed out until explicit revocation succeeds.
      // The protected quarantine is not an application bearer and will be
      // retried before any later credential replacement.
      await _clearLocalSessionState(
        clearToken: pendingRevocation == null && !hasOldToken,
      );
      Error.throwWithStackTrace(failure, stackTrace ?? StackTrace.current);
    }
  }

  Future<void> _afterAuthentication() async {
    final user = await _session.currentUser();
    if (user == null) {
      throw const AuthenticationFailure('get-session', 401);
    }
    await _signedIn(user);
  }

  Future<void> acceptCurrentTerms(CanonicalTerms terms) async {
    final client = legal;
    final bearer = await _session.bearerToken();
    if (client == null || bearer == null) {
      throw const LegalFailure('Legal acceptance is unavailable.');
    }
    await client.accept(terms, bearer);
    final user = _user;
    if (user == null) throw const AuthenticationFailure('get-session', 401);
    await _signedIn(user);
  }

  Future<void> _signedIn(SessionUser user, {bool persistUser = true}) async {
    // Interactive account replacement already completed its private cleanup
    // under the old bearer in _beforeCredentialReplacement.
    if (persistUser) await _userCache.write(user);
    final client = legal;
    final bearer = await _session.bearerToken();
    if (client != null && bearer != null) {
      try {
        _accountPolicy = await client.readPolicy(bearer);
      } on LegalFailure {
        _accountPolicy = null;
        _set(SessionStatus.legalRestricted, user);
        return;
      }
      if (!_accountPolicy!.isActive) {
        _set(SessionStatus.legalRestricted, user);
        return;
      }
    }
    _set(
      user.username == null
          ? SessionStatus.needsUsernameSetup
          : SessionStatus.signedIn,
      user,
    );
    if (user.username == null || _startedSessionUserId == user.id) return;
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

  Future<void> _signedOutLocally({
    bool clearPrivateData = true,
    bool clearToken = true,
  }) async {
    _invalidateSessionStartup();
    if (clearPrivateData) {
      try {
        await onPrivateDataClear?.call();
      } catch (_) {
        // Protected state still has to be removed after cleanup failures.
      }
    }
    await _clearLocalSessionState(clearToken: clearToken);
  }

  Future<void> _clearLocalSessionState({bool clearToken = true}) async {
    if (clearToken) await _tokenStore.clear();
    await _userCache.clear();
    _accountPolicy = null;
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

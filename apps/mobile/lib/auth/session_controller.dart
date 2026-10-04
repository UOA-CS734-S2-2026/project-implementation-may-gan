import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' show ClientException;

import '../drafts/draft_store.dart';
import 'native_session.dart';
import 'public_return_intent.dart';

enum SessionStatus {
  unknown,
  signedOut,
  legalAcceptanceRequired,
  legalStatusUnavailable,
  needsUsernameSetup,
  signedIn,
}

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
    this.clearUserMedia,
  });

  final BetterAuthNativeSession _session;
  final SessionTokenStore _tokenStore;
  final SessionUserCache _userCache;
  final DraftStore _drafts;

  /// Closes sockets and clears messaging caches before account state changes.
  final FutureOr<void> Function()? onPrivateDataClear;

  /// Deletes files kept for a user's draft, such as compressed media, when
  /// sign-out removes the draft. An expired session keeps the draft for the
  /// next sign-in, so its files stay too.
  final FutureOr<void> Function(String userId)? clearUserMedia;

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
  final PublicReturnIntentRegistry _publicReturnIntents =
      PublicReturnIntentRegistry();

  SessionStatus get status => _status;
  SessionUser? get user => _user;

  /// Changes before credentials are cleared or replaced. Async consumers use
  /// this with status and user ID to reject responses from an older session.
  int get generation => _sessionGeneration;

  Future<String?> bearerToken() => _session.bearerToken();

  PublicReturnIntent? issuePublicReturnIntent(
    String target,
    PublicActionIntent action,
  ) {
    if (_status != SessionStatus.signedOut) {
      _publicReturnIntents.clear();
      return null;
    }
    return _publicReturnIntents.issue(target, action);
  }

  PublicReturnIntent? resolvePublicReturnIntent(Uri uri) =>
      _publicReturnIntents.resolveAuth(uri, actorId: _user?.id);

  PublicReturnIntent? consumePublicReturnIntent(Uri uri) {
    final actorId = _status == SessionStatus.signedIn ? _user?.id : null;
    if (actorId == null) {
      _publicReturnIntents.clear();
      return null;
    }
    return _publicReturnIntents.consumePublic(uri, actorId: actorId);
  }

  void clearPublicReturnIntent() => _publicReturnIntents.clear();

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
        await _signedIn(cached, persistUser: false, verifyPolicy: false);
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

  Future<RegistrationTerms?> currentRegistrationTerms() =>
      _session.currentRegistrationTerms();

  Future<RegistrationProof?> issueRegistrationProof({
    required String flow,
    required RegistrationTerms? terms,
  }) => _session.issueRegistrationProof(flow: flow, terms: terms);

  Future<void> acceptCurrentLegalTerms(RegistrationTerms terms) async {
    await _session.recordLegalAcceptance(terms);
    await refreshAccountPolicy();
  }

  /// Rechecks the server-owned policy after acceptance or a temporary outage.
  Future<void> refreshAccountPolicy() async {
    final user = _user;
    if (user == null) throw const AuthenticationFailure('account-policy', 401);
    await _applyAccountPolicy(user, persistUser: false);
  }

  Future<void> signUp({
    required String name,
    required String username,
    required String? publicName,
    required String email,
    required String password,
    RegistrationProof? registrationProof,
  }) async {
    await _beforeCredentialReplacement();
    await _session.signUp(
      name: name,
      username: username,
      publicName: publicName,
      email: email,
      password: password,
      registrationProof: registrationProof,
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

  /// Records a username change so screens keyed on the handle follow it.
  Future<void> usernameChanged(String username) async {
    final user = _user;
    if (user == null || user.username == username) return;
    final renamed = SessionUser(
      id: user.id,
      name: user.name,
      email: user.email,
      username: username,
    );
    await _userCache.write(renamed);
    _set(SessionStatus.signedIn, renamed);
  }

  Future<void> signInWithGoogle(
    GoogleIdTokenProvider provider, {
    RegistrationProof? registrationProof,
  }) async {
    await _beforeCredentialReplacement();
    await _session.signInWithGoogle(
      provider,
      registrationProof: registrationProof,
    );
    await _afterAuthentication();
  }

  Future<void> linkGoogle({
    required GoogleIdTokenProvider provider,
    required String password,
  }) => _session.linkGoogle(provider: provider, password: password);

  /// Signs out and removes this user's protected draft, and the media saved
  /// for it, from the device.
  Future<void> signOut() => _signOut(removeDraft: true);

  /// Signs out so the same person must prove their account again, for
  /// example when Biometric Unlock can no longer use device authentication.
  /// Revocation and private-data cleanup match [signOut], but, as with an
  /// expired session, the protected draft and its media stay for this user's
  /// next sign-in.
  Future<void> signOutToReauthenticate() => _signOut(removeDraft: false);

  Future<void> _signOut({required bool removeDraft}) async {
    _publicReturnIntents.clear();
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
    if (removeDraft && userId != null) {
      await _drafts.clear(userId);
      try {
        await clearUserMedia?.call(userId);
      } catch (_) {
        // A file that can't be deleted must not keep the user signed in.
      }
    }
    await _signedOutLocally(clearPrivateData: false, clearToken: !revokeFailed);
  }

  /// Called when the API rejects the stored session.
  Future<void> sessionExpired() {
    _publicReturnIntents.clear();
    return _signedOutLocally();
  }

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

  Future<void> _signedIn(
    SessionUser user, {
    bool persistUser = true,
    bool verifyPolicy = true,
  }) async {
    // Interactive account replacement already completed its private cleanup
    // under the old bearer in _beforeCredentialReplacement.
    if (persistUser) await _userCache.write(user);
    if (verifyPolicy) {
      await _applyAccountPolicy(user, persistUser: false);
    } else {
      // Offline restoration cannot obtain a server policy decision. It keeps
      // local drafts usable; the server still rejects ordinary API actions
      // until connectivity returns and a later authenticated restore checks it.
      await _activateUser(user);
    }
  }

  Future<void> _applyAccountPolicy(
    SessionUser user, {
    required bool persistUser,
  }) async {
    if (persistUser) await _userCache.write(user);
    AccountPolicyStatus policy;
    try {
      policy = await _session.accountPolicy();
    } on AuthenticationFailure catch (error) {
      if (error.statusCode == 401) {
        await _signedOutLocally();
        return;
      }
      _set(SessionStatus.legalStatusUnavailable, user);
      return;
    } on Exception {
      _set(SessionStatus.legalStatusUnavailable, user);
      return;
    }
    if (policy.requiresLegalAcceptance) {
      _set(SessionStatus.legalAcceptanceRequired, user);
      return;
    }
    await _activateUser(user);
  }

  Future<void> _activateUser(SessionUser user) async {
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

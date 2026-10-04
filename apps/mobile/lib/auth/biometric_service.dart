import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/error_codes.dart' as auth_error;
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'session_controller.dart';

/// The outcome of a device authentication prompt.
enum BiometricResult {
  success,

  /// Cancelled, not recognised, or a transient plugin error. Retrying is safe.
  failed,

  /// Too many attempts. The device may need its passcode before trying again.
  lockedOut,

  /// The device has no usable passcode, biometrics, or hardware, so Dayli
  /// cannot verify the owner locally. Only account recovery can unlock.
  unavailable,
}

/// Persists whether Biometric Unlock is turned on.
abstract interface class BiometricPreferenceStore {
  bool readEnabled();
  Future<void> writeEnabled(bool enabled);
}

class SharedPreferencesBiometricStore implements BiometricPreferenceStore {
  SharedPreferencesBiometricStore(this._prefs);

  static const key = 'dayli.biometric_enabled';
  final SharedPreferences _prefs;

  @override
  bool readEnabled() => _prefs.getBool(key) ?? false;

  @override
  Future<void> writeEnabled(bool enabled) => _prefs.setBool(key, enabled);
}

/// Locks Dayli behind device authentication (Face ID, fingerprint, or the
/// device passcode) whenever the app leaves the foreground.
///
/// Lifecycle input is split in two, because the system prompt itself makes
/// the app `inactive`:
/// * [obscure] for `inactive`: a privacy cover with no prompt, ignored while
///   a prompt is open.
/// * [lockForBackground] for `hidden` and `paused`: always locks, even while
///   a prompt is open, so a confirmation prompt left open behind the home
///   screen cannot keep an unlocked app in the background.
class BiometricService extends ChangeNotifier {
  BiometricService(this._store, this._auth)
    : _isEnabled = _store.readEnabled() {
    _isLocked = _isEnabled; // A cold start with the lock on begins locked.
  }

  static const unlockReason = 'Unlock Dayli';
  static const enableReason = 'Authenticate to enable Biometric Unlock';
  static const disableReason = 'Authenticate to disable Biometric Unlock';

  final BiometricPreferenceStore _store;
  final LocalAuthentication _auth;

  bool _isEnabled;
  bool _isLocked = false;
  bool _isObscured = false;
  int _lockGeneration = 0;
  bool _inBackground = false;
  Future<BiometricResult>? _inFlight;

  bool get isEnabled => _isEnabled;
  bool get isLocked => _isLocked;

  /// True while the app is inactive and should hide its content without
  /// asking for authentication, such as in the app switcher.
  bool get isObscured => _isObscured;

  /// Whether a system authentication prompt is open.
  bool get isAuthenticating => _inFlight != null;

  /// Changes each time the app is backgrounded with no prompt open, so the
  /// lock screen can prompt again when the user returns.
  int get lockGeneration => _lockGeneration;

  /// Handles `inactive`. The system prompt also produces `inactive`, so this
  /// is ignored while a prompt is open.
  void obscure() {
    if (!_isEnabled || _isObscured || _inFlight != null) return;
    _isObscured = true;
    notifyListeners();
  }

  /// Handles `resumed`. This only removes the privacy cover; it never unlocks.
  void reveal() {
    _inBackground = false;
    if (!_isObscured) return;
    _isObscured = false;
    notifyListeners();
  }

  /// Handles `hidden` and `paused`. This locks even while a prompt is open: a
  /// pending prompt that later succeeds still unlocks, because the owner
  /// passed device authentication, but a cancelled one leaves the app locked.
  void lockForBackground() {
    if (!_isEnabled) return;
    // The way back also passes through `hidden`; prompt once per trip.
    final newTrip = !_inBackground;
    _inBackground = true;
    var changed = false;
    if (!_isLocked) {
      _isLocked = true;
      changed = true;
    }
    // A sticky prompt that is already open resumes by itself. Prompting again
    // would loop on Android, where the passcode screen pauses the app.
    if (newTrip && _inFlight == null) {
      _lockGeneration++;
      changed = true;
    }
    if (changed) notifyListeners();
  }

  /// Prompts to unlock. Joins a prompt that is already open.
  Future<BiometricResult> unlock() async {
    if (!_isLocked) return BiometricResult.success;
    return _prompt(unlockReason);
  }

  /// Turns Biometric Unlock on or off after the owner confirms with device
  /// authentication.
  Future<BiometricResult> setEnabled(bool enabled) async {
    if (enabled == _isEnabled) return BiometricResult.success;
    if (_inFlight != null) return BiometricResult.failed;

    final result = await _prompt(enabled ? enableReason : disableReason);
    if (result != BiometricResult.success) return result;

    await _store.writeEnabled(enabled);
    _isEnabled = enabled;
    if (!enabled) {
      _isLocked = false;
      _isObscured = false;
    }
    notifyListeners();
    return BiometricResult.success;
  }

  /// Recovery for when device authentication is no longer available. The
  /// session is revoked so the person has to sign in to their Dayli account
  /// again. The local lock is turned off only after sign-out succeeds, so a
  /// failed sign-out leaves the app locked.
  ///
  /// Returns whether the app was unlocked.
  Future<bool> recoverWithAccount(SessionController session) async {
    await session.signOutToReauthenticate();
    if (session.status != SessionStatus.signedOut) return false;

    await _store.writeEnabled(false);
    _isEnabled = false;
    _isLocked = false;
    _isObscured = false;
    notifyListeners();
    return true;
  }

  /// Maps the stable `PlatformException` codes from `local_auth` 2.x.
  @visibleForTesting
  static BiometricResult resultForErrorCode(String code) => switch (code) {
    auth_error.notAvailable ||
    auth_error.notEnrolled ||
    auth_error.passcodeNotSet ||
    auth_error.otherOperatingSystem ||
    // local_auth_darwin only; sent when biometrics can't be used at all.
    'BiometricNotAvailable' => BiometricResult.unavailable,
    auth_error.lockedOut ||
    auth_error.permanentlyLockedOut => BiometricResult.lockedOut,
    _ => BiometricResult.failed,
  };

  Future<BiometricResult> _prompt(String reason) =>
      _inFlight ??= _runPrompt(reason).whenComplete(() => _inFlight = null);

  Future<BiometricResult> _runPrompt(String reason) async {
    final result = await _authenticate(reason);
    if (result == BiometricResult.success && _isLocked) {
      _isLocked = false;
      _isObscured = false;
      notifyListeners();
    }
    return result;
  }

  Future<BiometricResult> _authenticate(String reason) async {
    try {
      final supported =
          await _auth.canCheckBiometrics || await _auth.isDeviceSupported();
      if (!supported) return BiometricResult.unavailable;

      final authenticated = await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(stickyAuth: true),
      );
      return authenticated ? BiometricResult.success : BiometricResult.failed;
    } on PlatformException catch (error) {
      return resultForErrorCode(error.code);
    } catch (_) {
      return BiometricResult.failed;
    }
  }
}

import 'package:flutter/foundation.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

class BiometricService extends ChangeNotifier {
  BiometricService(this._prefs, this._auth) {
    _isEnabled = _prefs.getBool(_prefsKey) ?? false;
    _isLocked = _isEnabled; // App starts locked if enabled
  }

  static const _prefsKey = 'dayli.biometric_enabled';
  final SharedPreferences _prefs;
  final LocalAuthentication _auth;

  bool _isEnabled = false;
  bool _isLocked = false;
  bool _isAuthenticating = false;

  bool get isEnabled => _isEnabled;
  bool get isLocked => _isLocked;

  /// Locks the app if biometric authentication is enabled,
  /// unless we are actively prompting the user for biometrics.
  void lock() {
    if (_isEnabled && !_isLocked && !_isAuthenticating) {
      _isLocked = true;
      notifyListeners();
    }
  }

  /// Attempts to enable or disable biometric authentication.
  /// Prompts the user to authenticate before either state change.
  /// Returns whether the operation was successful.
  Future<bool> setEnabled(bool enabled) async {
    final canAuthenticate =
        await _auth.canCheckBiometrics || await _auth.isDeviceSupported();
    if (!canAuthenticate) return false;

    final reason = enabled
        ? 'Authenticate to enable Biometric Unlock'
        : 'Authenticate to disable Biometric Unlock';
        
    final authenticated = await authenticate(reason: reason);
    if (!authenticated) return false;

    _isEnabled = enabled;
    await _prefs.setBool(_prefsKey, enabled);

    if (!enabled && _isLocked) {
      _isLocked = false;
    }
    notifyListeners();
    return true;
  }

  /// Triggers the native biometric prompt.
  Future<bool> authenticate({String reason = 'Unlock Dayli'}) async {
    _isAuthenticating = true;
    try {
      final authenticated = await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          stickyAuth: true,
        ),
      );

      if (authenticated && _isLocked) {
        _isLocked = false;
        notifyListeners();
      }
      return authenticated;
    } catch (e) {
      return false;
    } finally {
      _isAuthenticating = false;
    }
  }
}

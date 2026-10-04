import 'package:dayli_mobile/auth/biometric_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:local_auth_platform_interface/types/auth_messages.dart';

class FakeLocalAuthentication extends LocalAuthentication {
  bool checkBiometrics = true;
  bool deviceSupported = true;
  bool authenticateResult = true;
  bool authenticateThrows = false;
  String? lastReason;

  @override
  Future<bool> get canCheckBiometrics async => checkBiometrics;

  @override
  Future<bool> isDeviceSupported() async => deviceSupported;

  @override
  Future<bool> authenticate({
    required String localizedReason,
    Iterable<AuthMessages> authMessages = const <AuthMessages>[],
    AuthenticationOptions options = const AuthenticationOptions(),
  }) async {
    lastReason = localizedReason;
    if (authenticateThrows) {
      throw Exception('Auth error');
    }
    return authenticateResult;
  }
}

void main() {
  late FakeLocalAuthentication auth;

  setUp(() {
    auth = FakeLocalAuthentication();
  });

  test('initializes correctly when disabled', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final service = BiometricService(prefs, auth);

    expect(service.isEnabled, isFalse);
    expect(service.isLocked, isFalse);
  });

  test('initializes correctly when enabled', () async {
    SharedPreferences.setMockInitialValues({'dayli.biometric_enabled': true});
    final prefs = await SharedPreferences.getInstance();
    final service = BiometricService(prefs, auth);

    expect(service.isEnabled, isTrue);
    expect(service.isLocked, isTrue);
  });

  test('lock does not lock if disabled', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final service = BiometricService(prefs, auth);

    service.lock();
    expect(service.isLocked, isFalse);
  });

  test('lock locks if enabled', () async {
    SharedPreferences.setMockInitialValues({'dayli.biometric_enabled': true});
    final prefs = await SharedPreferences.getInstance();
    final service = BiometricService(prefs, auth);

    // First unlock it
    await service.authenticate();
    expect(service.isLocked, isFalse);

    // Then lock it
    service.lock();
    expect(service.isLocked, isTrue);
  });

  test('lock does not lock if actively authenticating', () async {
    SharedPreferences.setMockInitialValues({'dayli.biometric_enabled': true});
    final prefs = await SharedPreferences.getInstance();
    final service = BiometricService(prefs, auth);

    // Unlock
    await service.authenticate();

    // Start a fake authenticate that yields, and call lock during it
    final future = service.authenticate();
    service.lock();
    expect(service.isLocked, isFalse); // Should not lock because _isAuthenticating is true
    await future;
  });

  group('setEnabled', () {
    test('enabling fails if device unsupported', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final service = BiometricService(prefs, auth);

      auth.checkBiometrics = false;
      auth.deviceSupported = false;

      final success = await service.setEnabled(true);
      expect(success, isFalse);
      expect(service.isEnabled, isFalse);
    });

    test('enabling prompts for authentication and succeeds', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final service = BiometricService(prefs, auth);

      final success = await service.setEnabled(true);
      expect(success, isTrue);
      expect(service.isEnabled, isTrue);
      expect(service.isLocked, isFalse); // Should not immediately lock
      expect(auth.lastReason, 'Authenticate to enable Biometric Unlock');
      expect(prefs.getBool('dayli.biometric_enabled'), isTrue);
    });

    test('enabling fails if authentication fails', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final service = BiometricService(prefs, auth);

      auth.authenticateResult = false;

      final success = await service.setEnabled(true);
      expect(success, isFalse);
      expect(service.isEnabled, isFalse);
    });

    test('disabling prompts for authentication and succeeds', () async {
      SharedPreferences.setMockInitialValues({'dayli.biometric_enabled': true});
      final prefs = await SharedPreferences.getInstance();
      final service = BiometricService(prefs, auth);

      // Successfully authenticate to disable
      final success = await service.setEnabled(false);
      expect(success, isTrue);
      expect(service.isEnabled, isFalse);
      expect(service.isLocked, isFalse);
      expect(auth.lastReason, 'Authenticate to disable Biometric Unlock');
      expect(prefs.getBool('dayli.biometric_enabled'), isFalse);
    });

    test('disabling fails if authentication fails and state remains unchanged', () async {
      SharedPreferences.setMockInitialValues({'dayli.biometric_enabled': true});
      final prefs = await SharedPreferences.getInstance();
      final service = BiometricService(prefs, auth);

      auth.authenticateResult = false;

      final success = await service.setEnabled(false);
      expect(success, isFalse);
      expect(service.isEnabled, isTrue);
      expect(service.isLocked, isTrue); // Should still be locked/enabled
    });
  });
}

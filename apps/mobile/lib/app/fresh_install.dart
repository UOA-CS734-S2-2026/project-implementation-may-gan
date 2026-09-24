import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _installMarkerKey = 'dayli.install-marker.v1';

/// iOS keeps Keychain entries after an app is deleted, so a reinstall could
/// otherwise inherit the previous installation's session token and drafts.
/// Shared preferences are removed with the app, so a missing marker means this
/// is a fresh install and all protected entries are wiped before first use.
Future<void> clearProtectedStorageAfterReinstall({
  required Future<SharedPreferences> preferences,
  required FlutterSecureStorage secureStorage,
}) async {
  final prefs = await preferences;
  if (prefs.getBool(_installMarkerKey) == true) return;
  await secureStorage.deleteAll();
  await prefs.setBool(_installMarkerKey, true);
}

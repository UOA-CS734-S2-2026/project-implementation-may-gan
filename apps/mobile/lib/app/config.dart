import 'package:flutter/foundation.dart';

/// The registered iOS debug app includes the native push entitlement.
/// An explicit build flag still takes precedence, including an opt-out.
bool firebasePushConfiguredForBuild({
  TargetPlatform? platform,
  bool debugMode = kDebugMode,
  bool web = kIsWeb,
  bool? configured,
}) =>
    configured ??
    (!web &&
        debugMode &&
        (platform ?? defaultTargetPlatform) == TargetPlatform.iOS);

/// Build-time configuration passed with `--dart-define`.
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    this.googleWebClientId = '',
    this.googleIosClientId = '',
    this.firebaseConfigured = false,
    this.stagingExportApproved = false,
  });

  /// The Hono API origin, for example `https://api.example.test`. See
  /// docs/dayli/environments.md for emulator and device addresses.
  final String apiBaseUrl;

  /// Google OAuth client IDs for native sign-in. Google sign-in is offered
  /// only when the web (server) client ID is set.
  final String googleWebClientId;
  final String googleIosClientId;

  /// Enables the checked-in staging Firebase options in a debug build.
  /// Release and profile builds reject this setting.
  final bool firebaseConfigured;

  /// Explicit for staging tester builds. Production API origins cannot open it.
  final bool stagingExportApproved;

  bool get googleSignInConfigured => googleWebClientId.isNotEmpty;
  bool get accountExportEnabled =>
      stagingExportApproved &&
      apiBaseUrl == 'https://api.staging.dayli.agroupforcoders.com';
  // Keep native request submission fail closed until server-side realtime
  // revocation has durable retry and reconciliation evidence.
  bool get accountDeletionEnabled => false;

  static AppConfig fromEnvironment() {
    const apiBaseUrl = String.fromEnvironment('DAYLI_API_BASE_URL');
    if (apiBaseUrl.isEmpty) {
      throw StateError(
        'Set --dart-define=DAYLI_API_BASE_URL=<api origin> to run Dayli.',
      );
    }
    return AppConfig(
      apiBaseUrl: apiBaseUrl,
      googleWebClientId: const String.fromEnvironment(
        'DAYLI_GOOGLE_WEB_CLIENT_ID',
      ),
      googleIosClientId: const String.fromEnvironment(
        'DAYLI_GOOGLE_IOS_CLIENT_ID',
      ),
      firebaseConfigured: firebasePushConfiguredForBuild(
        configured: const bool.hasEnvironment('DAYLI_FIREBASE_CONFIGURED')
            ? const bool.fromEnvironment('DAYLI_FIREBASE_CONFIGURED')
            : null,
      ),
      stagingExportApproved: const bool.fromEnvironment(
        'DAYLI_STAGING_EXPORT_APPROVED',
      ),
    );
  }
}

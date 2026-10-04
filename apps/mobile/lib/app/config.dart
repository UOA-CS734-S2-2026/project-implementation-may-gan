/// Build-time configuration passed with `--dart-define`.
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    this.googleWebClientId = '',
    this.googleIosClientId = '',
    this.firebaseConfigured = false,
    this.stagingExportApproved = false,
    this.stagingAccountDeletionApproval = '',
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

  /// Exact opt-in for a single staging build. Any other value is inert.
  final String stagingAccountDeletionApproval;

  bool get googleSignInConfigured => googleWebClientId.isNotEmpty;
  bool get accountExportEnabled =>
      stagingExportApproved &&
      apiBaseUrl == 'https://api.staging.dayli.agroupforcoders.com';
  bool get accountDeletionEnabled =>
      stagingAccountDeletionApproval == 'request-deletion-staging' &&
      apiBaseUrl == 'https://api.staging.dayli.agroupforcoders.com';

  static AppConfig fromEnvironment() {
    const apiBaseUrl = String.fromEnvironment('DAYLI_API_BASE_URL');
    if (apiBaseUrl.isEmpty) {
      throw StateError(
        'Set --dart-define=DAYLI_API_BASE_URL=<api origin> to run Dayli.',
      );
    }
    return const AppConfig(
      apiBaseUrl: apiBaseUrl,
      googleWebClientId: String.fromEnvironment('DAYLI_GOOGLE_WEB_CLIENT_ID'),
      googleIosClientId: String.fromEnvironment('DAYLI_GOOGLE_IOS_CLIENT_ID'),
      firebaseConfigured: bool.fromEnvironment('DAYLI_FIREBASE_CONFIGURED'),
      stagingExportApproved: bool.fromEnvironment(
        'DAYLI_STAGING_EXPORT_APPROVED',
      ),
      stagingAccountDeletionApproval: String.fromEnvironment(
        'DAYLI_STAGING_ACCOUNT_DELETION_APPROVED',
      ),
    );
  }
}

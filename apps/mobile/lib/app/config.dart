/// Build-time configuration passed with `--dart-define`.
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    this.googleWebClientId = '',
    this.googleIosClientId = '',
    this.firebaseConfigured = false,
    this.mediaUploadsEnabled = false,
  });

  /// The Hono API origin, for example `https://api.example.test`. See
  /// docs/dayli/environments.md for emulator and device addresses.
  final String apiBaseUrl;

  /// Google OAuth client IDs for native sign-in. Google sign-in is offered
  /// only when the web (server) client ID is set.
  final String googleWebClientId;
  final String googleIosClientId;

  /// Set only in builds that include owner-provided Firebase platform files.
  final bool firebaseConfigured;

  /// Off by default. Posts can't carry media until the API links uploaded
  /// attachments to posts, so an upload made now would be orphaned when the
  /// dayli posts. Turn it on only to test uploads.
  final bool mediaUploadsEnabled;

  bool get googleSignInConfigured => googleWebClientId.isNotEmpty;

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
      mediaUploadsEnabled: bool.fromEnvironment('DAYLI_MEDIA_UPLOADS'),
    );
  }
}

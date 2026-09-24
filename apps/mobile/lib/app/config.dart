/// Build-time configuration passed with `--dart-define`.
class AppConfig {
  const AppConfig({required this.apiBaseUrl});

  /// The Hono API origin, for example `https://api.example.test`. See
  /// docs/dayli/environments.md for emulator and device addresses.
  final String apiBaseUrl;

  static AppConfig fromEnvironment() {
    const apiBaseUrl = String.fromEnvironment('DAYLI_API_BASE_URL');
    if (apiBaseUrl.isEmpty) {
      throw StateError(
        'Set --dart-define=DAYLI_API_BASE_URL=<api origin> to run Dayli.',
      );
    }
    return const AppConfig(apiBaseUrl: apiBaseUrl);
  }
}

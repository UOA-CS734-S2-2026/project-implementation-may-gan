import 'dart:async';

/// Provider boundary. The Firebase implementation is deliberately deferred
/// until project ownership, APNs configuration, and physical-device release
/// evidence are available. No token is persisted by this layer.
abstract interface class PushTokenSource {
  Future<PushPermission> requestPermission();
  Future<String?> currentToken();
  Stream<String> get tokenRefreshes;
  /// Removes the provider token from this installation after server cleanup.
  Future<void> invalidateLocalToken();
}

enum PushPermission { granted, denied, provisional }

abstract interface class PushRegistrationClient {
  Future<void> register({
    required String installationId,
    required String token,
    required String platform,
    required bool optedIn,
  });
  Future<void> unregister(String installationId);
}

/// Session-scoped lifecycle coordinator. Its owner invokes [start] after
/// authentication and [stop] before token/session teardown, preventing a
/// token retained for Alice from receiving Bob's notifications.
class PushService {
  PushService({
    required this.source,
    required this.client,
    required this.installationId,
    required this.platform,
  });
  final PushTokenSource source;
  final PushRegistrationClient client;
  final String installationId;
  final String platform;
  StreamSubscription<String>? _subscription;

  Future<void> start() async {
    final permission = await source.requestPermission();
    if (permission == PushPermission.denied) {
      return;
    }
    final token = await source.currentToken();
    if (token != null) {
      await client.register(
        installationId: installationId,
        token: token,
        platform: platform,
        optedIn: true,
      );
    }
    _subscription ??= source.tokenRefreshes.listen((token) {
      unawaited(
        client.register(
          installationId: installationId,
          token: token,
          platform: platform,
          optedIn: true,
        ),
      );
    });
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
    // This call uses the currently installed bearer credential. Callers that
    // are about to replace accounts must await it before replacing that token.
    await client.unregister(installationId);
    await source.invalidateLocalToken();
  }
}

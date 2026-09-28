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
  int _epoch = 0;

  bool _current(int epoch) => epoch == _epoch;

  Future<void> start() async {
    final epoch = ++_epoch;
    final permission = await source.requestPermission();
    if (!_current(epoch) || permission == PushPermission.denied) return;
    final token = await source.currentToken();
    if (!_current(epoch)) return;
    if (token != null) await _register(epoch, token);
    if (!_current(epoch)) return;
    await _subscription?.cancel();
    if (!_current(epoch)) return;
    _subscription = source.tokenRefreshes.listen((token) {
      unawaited(_register(epoch, token));
    });
  }

  Future<void> _register(int epoch, String token) async {
    if (!_current(epoch)) return;
    await client.register(
      installationId: installationId,
      token: token,
      platform: platform,
      optedIn: true,
    );
  }

  Future<void> stop() async {
    // Fence async permission, token, registration, and stream work before
    // cleanup so a late old-account start cannot resume after a switch.
    ++_epoch;
    await _subscription?.cancel();
    _subscription = null;
    // This call uses the currently installed bearer credential. Callers that
    // are about to replace accounts must await it before replacing that token.
    await client.unregister(installationId);
    await source.invalidateLocalToken();
  }
}

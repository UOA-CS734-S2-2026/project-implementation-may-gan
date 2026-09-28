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

  // Registration writes are serialized so cleanup's DELETE is always issued
  // after all locally started PUTs have settled.
  Future<void> _registrationTail = Future<void>.value();

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
      // A refresh is best effort, but its write remains in the serialized
      // tail so stop can drain it before unregistering the installation.
      unawaited(_register(epoch, token).catchError((_) {}));
    });
  }

  Future<void> _register(int epoch, String token) {
    if (!_current(epoch)) return Future<void>.value();
    final operation = _registrationTail.catchError((_) {}).then((_) async {
      if (!_current(epoch)) return;
      await client.register(
        installationId: installationId,
        token: token,
        platform: platform,
        optedIn: true,
      );
    });
    // Preserve the operation's error for an initial start caller, while the
    // tail always recovers so a failed PUT cannot block cleanup or later work.
    _registrationTail = operation.catchError((_) {});
    return operation;
  }

  Future<void> stop() async {
    // Fence async permission, token, registration, and stream work before
    // cleanup so a late old-account start cannot resume after a switch.
    ++_epoch;
    Object? failure;
    StackTrace? stackTrace;

    Future<void> attempt(Future<void> Function() operation) async {
      try {
        await operation();
      } catch (error, trace) {
        failure ??= error;
        stackTrace ??= trace;
      }
    }

    await attempt(() async => _subscription?.cancel());
    _subscription = null;
    // Drain every locally initiated registration before deleting under the
    // old bearer. A transport timeout cannot prove that a remote PUT did not
    // commit. Session revocation prevents a tardy remote PUT from passing the
    // backend's live-session delivery check after an account replacement.
    await attempt(() async => _registrationTail);
    // This call uses the currently installed bearer credential. Callers that
    // are about to replace accounts must await it before replacing that token.
    await attempt(() => client.unregister(installationId));
    // Always attempt provider-token invalidation, even when DELETE fails.
    await attempt(source.invalidateLocalToken);
    if (failure != null) Error.throwWithStackTrace(failure!, stackTrace!);
  }
}

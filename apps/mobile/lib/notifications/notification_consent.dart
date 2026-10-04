import 'dart:async';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../auth/session_controller.dart';
import 'firebase_push_source.dart';
import 'push_service.dart';

class NotificationPreferenceOperation {
  NotificationPreferenceOperation._();

  bool _current = true;
  final Completer<void> _cancelled = Completer<void>();

  bool get isCurrent => _current;
  Future<void> get cancelled => _cancelled.future;

  void cancel() {
    if (!_current) return;
    _current = false;
    _cancelled.complete();
  }
}

class NotificationPreferenceOperationCancelled implements Exception {
  const NotificationPreferenceOperationCancelled();
}

abstract interface class NotificationPreferenceClient {
  Future<bool> get(NotificationPreferenceOperation operation);
  Future<bool> update(bool enabled, NotificationPreferenceOperation operation);
}

class HttpNotificationPreferenceClient implements NotificationPreferenceClient {
  HttpNotificationPreferenceClient({
    required String baseUrl,
    required this.bearerToken,
    this.httpClient,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() bearerToken;
  final http.Client? httpClient;

  Future<generated.NotificationsApi> _api(
    NotificationPreferenceOperation operation,
  ) async {
    final token = await bearerToken();
    // The bearer lookup can involve protected storage. Account cleanup
    // invalidates the operation before a replacement token may be installed.
    // Never send if that lookup resumed for a retired actor.
    if (!operation.isCurrent) {
      throw const NotificationPreferenceOperationCancelled();
    }
    if (token == null) throw const HttpException('No authenticated session.');
    final auth = generated.HttpBearerAuth()..accessToken = token;
    final apiClient = generated.ApiClient(
      basePath: _baseUrl,
      authentication: auth,
    );
    if (httpClient != null) apiClient.client = httpClient!;
    return generated.NotificationsApi(apiClient);
  }

  @override
  Future<bool> get(NotificationPreferenceOperation operation) async {
    final value = await (await _api(operation)).getNotificationPreference();
    if (value == null) throw const FormatException('Empty preference.');
    return value.enabled;
  }

  @override
  Future<bool> update(
    bool enabled,
    NotificationPreferenceOperation operation,
  ) async {
    final value = await (await _api(operation)).updateNotificationPreference(
      generated.UpdateNotificationPreferenceRequest(enabled: enabled),
    );
    if (value == null) throw const FormatException('Empty preference.');
    return value.enabled;
  }
}

/// Owns the account preference and optional device registration as one
/// session-fenced unit. A failed read is treated as disabled and performs no
/// token IO.
typedef NotificationPreferenceDrain =
    Future<void> Function(Future<void> pending);

Future<void> _boundedPreferenceDrain(Future<void> pending) async {
  try {
    await pending.timeout(const Duration(seconds: 2));
  } on TimeoutException {
    // The canceled operation remains observed, but it cannot block auth.
  } catch (_) {
    // Preference failures do not prevent server-session revocation.
  }
}

class NotificationConsentController extends ChangeNotifier {
  NotificationConsentController({
    required this.client,
    this.push,
    this.lifecycle,
    this.preferenceDrain = _boundedPreferenceDrain,
  }) : assert((push == null) == (lifecycle == null));

  final NotificationPreferenceClient client;
  final PushService? push;
  final FirebasePushLifecycle? lifecycle;
  final NotificationPreferenceDrain preferenceDrain;
  bool _enabled = false;
  bool _loading = false;
  Object? _failure;
  int _epoch = 0;
  SessionStartup? _activeStartup;
  Future<void> _preferenceTail = Future<void>.value();
  final Set<NotificationPreferenceOperation> _preferenceOperations = {};

  bool get enabled => _enabled;
  bool get loading => _loading;
  bool get deviceSupported => push != null;
  bool get canEnable => deviceSupported && !_loading;
  Object? get failure => _failure;

  /// Called after sign-in, but intentionally completes immediately so a slow
  /// preference network read cannot delay authentication or realtime startup.
  void start(SessionStartup startup) {
    final epoch = ++_epoch;
    _activeStartup = startup;
    _enabled = false;
    _failure = null;
    _loading = true;
    notifyListeners();
    unawaited(_load(startup, epoch));
  }

  Future<void> _load(SessionStartup startup, int epoch) async {
    try {
      final enabled = await _runPreference(client.get);
      if (!_current(startup, epoch)) return;
      _enabled = enabled;
      if (!enabled || !deviceSupported) {
        _loading = false;
        notifyListeners();
        return;
      }
      final active = await push!.start();
      if (!_current(startup, epoch)) return;
      _loading = false;
      if (active) lifecycle!.enable();
      notifyListeners();
    } catch (error) {
      if (!_current(startup, epoch)) return;
      _enabled = false;
      _loading = false;
      _failure = error;
      notifyListeners();
    }
  }

  bool _current(SessionStartup startup, int epoch) =>
      epoch == _epoch &&
      identical(startup, _activeStartup) &&
      startup.isCurrent;

  Future<T> _runPreference<T>(
    Future<T> Function(NotificationPreferenceOperation operation) operation,
  ) {
    final lease = NotificationPreferenceOperation._();
    _preferenceOperations.add(lease);
    final operationFuture = _preferenceTail.catchError((_) {}).then((_) {
      if (!lease.isCurrent) {
        throw const NotificationPreferenceOperationCancelled();
      }
      return operation(lease);
    });
    final result = Future.any<T>([
      operationFuture,
      lease.cancelled.then<T>(
        (_) => throw const NotificationPreferenceOperationCancelled(),
      ),
    ]);
    _preferenceTail = result.then<void>((_) {}).catchError((_) {});
    _preferenceTail.then((_) => _preferenceOperations.remove(lease));
    return result;
  }

  /// Called only from the explicit settings switch action.
  Future<bool> setEnabled(bool value) async {
    final startup = _activeStartup;
    if (_loading ||
        value == _enabled ||
        startup == null ||
        !startup.isCurrent ||
        (value && !deviceSupported)) {
      return _enabled;
    }
    final epoch = _epoch;
    _loading = true;
    _failure = null;
    notifyListeners();
    try {
      if (value) {
        final permission = await push!.requestPermission();
        if (!_current(startup, epoch)) return _enabled;
        if (permission == PushPermission.denied) {
          _loading = false;
          notifyListeners();
          return false;
        }
        final saved = await _runPreference(
          (operation) => client.update(true, operation),
        );
        if (!_current(startup, epoch) || !saved) return _enabled;
        final active = await push!.startWithPermission(permission);
        if (!_current(startup, epoch)) return _enabled;
        _enabled = true;
        _loading = false;
        if (active) lifecycle!.enable();
        notifyListeners();
        return true;
      }

      final saved = await _runPreference(
        (operation) => client.update(false, operation),
      );
      if (!_current(startup, epoch) || saved) return _enabled;
      _enabled = false;
      await lifecycle?.disableAndClear();
      await push?.stop();
      if (!_current(startup, epoch)) return _enabled;
      _loading = false;
      notifyListeners();
      return false;
    } catch (error) {
      if (!_current(startup, epoch)) return _enabled;
      _loading = false;
      _failure = error;
      notifyListeners();
      return _enabled;
    }
  }

  Future<void> clear() async {
    ++_epoch;
    _activeStartup = null;
    _enabled = false;
    _loading = false;
    _failure = null;
    notifyListeners();
    // Invalidate before SessionController may install another bearer. A
    // deferred protected-storage lookup checks this fence before transport.
    for (final operation in _preferenceOperations) {
      operation.cancel();
    }
    _preferenceOperations.clear();
    final retiredTail = _preferenceTail;
    // A new actor gets a fresh lane even if old HTTP never settles.
    _preferenceTail = Future<void>.value();
    await preferenceDrain(retiredTail);
    await lifecycle?.disableAndClear();
    await push?.stop();
  }
}

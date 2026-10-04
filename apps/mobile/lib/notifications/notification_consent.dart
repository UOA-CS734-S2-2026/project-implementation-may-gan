import 'dart:async';
import 'dart:io';

import 'package:dayli_api_client/api.dart' as generated;
import 'package:flutter/foundation.dart';

import '../auth/session_controller.dart';
import 'firebase_push_source.dart';
import 'push_service.dart';

abstract interface class NotificationPreferenceClient {
  Future<bool> get();
  Future<bool> update(bool enabled);
}

class HttpNotificationPreferenceClient implements NotificationPreferenceClient {
  HttpNotificationPreferenceClient({
    required String baseUrl,
    required this.bearerToken,
  }) : _baseUrl = baseUrl.replaceFirst(RegExp(r'/$'), '');

  final String _baseUrl;
  final Future<String?> Function() bearerToken;

  Future<generated.NotificationsApi> _api() async {
    final token = await bearerToken();
    if (token == null) throw const HttpException('No authenticated session.');
    final auth = generated.HttpBearerAuth()..accessToken = token;
    return generated.NotificationsApi(
      generated.ApiClient(basePath: _baseUrl, authentication: auth),
    );
  }

  @override
  Future<bool> get() async {
    final value = await (await _api()).getNotificationPreference();
    if (value == null) throw const FormatException('Empty preference.');
    return value.enabled;
  }

  @override
  Future<bool> update(bool enabled) async {
    final value = await (await _api()).updateNotificationPreference(
      generated.UpdateNotificationPreferenceRequest(enabled: enabled),
    );
    if (value == null) throw const FormatException('Empty preference.');
    return value.enabled;
  }
}

/// Owns the account preference and optional device registration as one
/// session-fenced unit. A failed read is treated as disabled and performs no
/// token IO.
class NotificationConsentController extends ChangeNotifier {
  NotificationConsentController({
    required this.client,
    this.push,
    this.lifecycle,
  }) : assert((push == null) == (lifecycle == null));

  final NotificationPreferenceClient client;
  final PushService? push;
  final FirebasePushLifecycle? lifecycle;
  bool _enabled = false;
  bool _loading = false;
  Object? _failure;
  int _epoch = 0;
  SessionStartup? _activeStartup;
  Future<void> _preferenceTail = Future<void>.value();

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

  Future<T> _runPreference<T>(Future<T> Function() operation) {
    final result = _preferenceTail.catchError((_) {}).then((_) => operation());
    _preferenceTail = result.then<void>((_) {}).catchError((_) {});
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
        final saved = await _runPreference(() => client.update(true));
        if (!_current(startup, epoch) || !saved) return _enabled;
        final active = await push!.startWithPermission(permission);
        if (!_current(startup, epoch)) return _enabled;
        _enabled = true;
        _loading = false;
        if (active) lifecycle!.enable();
        notifyListeners();
        return true;
      }

      final saved = await _runPreference(() => client.update(false));
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
    // SessionController awaits this hook before an authentication request can
    // replace the bearer. Drain reads and writes while the old credential is
    // still installed, so an old UI action cannot mutate the next account.
    await _preferenceTail.catchError((_) {});
    await lifecycle?.disableAndClear();
    await push?.stop();
  }
}

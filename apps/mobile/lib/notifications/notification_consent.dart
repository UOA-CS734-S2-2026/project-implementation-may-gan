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

/// Owns the account preference and device registration as one session-fenced
/// unit. A failed read is always treated as disabled and performs no token IO.
class NotificationConsentController extends ChangeNotifier {
  NotificationConsentController({
    required this.client,
    required this.push,
    required this.lifecycle,
  });

  final NotificationPreferenceClient client;
  final PushService push;
  final FirebasePushLifecycle lifecycle;
  bool _enabled = false;
  bool _loading = false;
  Object? _failure;
  int _epoch = 0;

  bool get enabled => _enabled;
  bool get loading => _loading;
  Object? get failure => _failure;

  /// Called after sign-in, but intentionally completes immediately so a slow
  /// preference network read cannot delay authentication or realtime startup.
  void start(SessionStartup startup) {
    final epoch = ++_epoch;
    _enabled = false;
    _failure = null;
    _loading = true;
    notifyListeners();
    unawaited(_load(startup, epoch));
  }

  Future<void> _load(SessionStartup startup, int epoch) async {
    try {
      final enabled = await client.get();
      if (!_current(startup, epoch)) return;
      if (!enabled) {
        _loading = false;
        notifyListeners();
        return;
      }
      final active = await push.start();
      if (!_current(startup, epoch)) return;
      _enabled = true;
      _loading = false;
      if (active) lifecycle.enable();
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
      epoch == _epoch && startup.isCurrent;

  /// Called only from the explicit settings switch action.
  Future<bool> setEnabled(bool value) async {
    if (_loading || value == _enabled) return _enabled;
    final epoch = _epoch;
    _loading = true;
    _failure = null;
    notifyListeners();
    try {
      if (value) {
        final permission = await push.requestPermission();
        if (epoch != _epoch) return _enabled;
        if (permission == PushPermission.denied) {
          _loading = false;
          notifyListeners();
          return false;
        }
        final saved = await client.update(true);
        if (epoch != _epoch || !saved) return _enabled;
        final active = await push.startWithPermission(permission);
        if (epoch != _epoch) return _enabled;
        _enabled = true;
        _loading = false;
        if (active) lifecycle.enable();
        notifyListeners();
        return true;
      }

      final saved = await client.update(false);
      if (epoch != _epoch || saved) return _enabled;
      _enabled = false;
      await lifecycle.disableAndClear();
      await push.stop();
      if (epoch != _epoch) return _enabled;
      _loading = false;
      notifyListeners();
      return false;
    } catch (error) {
      if (epoch != _epoch) return _enabled;
      _loading = false;
      _failure = error;
      notifyListeners();
      return _enabled;
    }
  }

  Future<void> clear() async {
    ++_epoch;
    _enabled = false;
    _loading = false;
    _failure = null;
    notifyListeners();
    await lifecycle.disableAndClear();
    await push.stop();
  }
}

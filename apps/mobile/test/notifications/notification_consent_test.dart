import 'dart:async';
import 'dart:convert';

import 'package:dayli_mobile/auth/native_session.dart';
import 'package:dayli_mobile/auth/session_controller.dart';
import 'package:dayli_mobile/notifications/firebase_push_source.dart';
import 'package:dayli_mobile/notifications/notification_consent.dart';
import 'package:dayli_mobile/notifications/notification_presenter.dart';
import 'package:dayli_mobile/notifications/push_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../support/fakes.dart';

class _Preference implements NotificationPreferenceClient {
  bool value = false;
  Object? getError;
  final updates = <bool>[];
  Completer<bool>? deferredGet;

  @override
  Future<bool> get() async {
    if (getError case final error?) throw error;
    return deferredGet?.future ?? value;
  }

  @override
  Future<bool> update(bool enabled) async {
    updates.add(enabled);
    value = enabled;
    return value;
  }
}

class _Source implements PushTokenSource {
  PushPermission permission = PushPermission.granted;
  int currentChecks = 0;
  int prompts = 0;
  int tokenReads = 0;
  int invalidations = 0;
  final refreshes = StreamController<String>();

  @override
  Future<PushPermission> currentPermission() async {
    currentChecks++;
    return permission;
  }

  @override
  Future<PushPermission> requestPermission() async {
    prompts++;
    return permission;
  }

  @override
  Future<String?> currentToken() async {
    tokenReads++;
    return 'provider-token';
  }

  @override
  Future<void> invalidateLocalToken() async => invalidations++;

  @override
  Stream<String> get tokenRefreshes => refreshes.stream;
}

class _Registration implements PushRegistrationClient {
  final versions = <int>[];
  int unregisters = 0;

  @override
  Future<void> register({
    required String installationId,
    required String token,
    required String platform,
    required bool optedIn,
    required int notificationSchemaVersion,
  }) async => versions.add(notificationSchemaVersion);

  @override
  Future<void> unregister(String installationId) async => unregisters++;
}

class _Presenter extends NoopNotificationPresenter {
  const _Presenter();
}

Future<({SessionController session, SessionStartup startup})>
_signedIn() async {
  final tokens = MemoryTokenStore()..value = 'token';
  final startup = Completer<SessionStartup>();
  final session = SessionController(
    session: BetterAuthNativeSession(
      baseUrl: 'https://api.example.test',
      tokenStore: tokens,
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'user': {
              'id': 'alice',
              'name': 'Alice',
              'email': 'alice@example.test',
              'username': 'alice',
            },
          }),
          200,
        ),
      ),
    ),
    tokenStore: tokens,
    userCache: MemoryUserCache(),
    drafts: MemoryDraftStore(),
    onSignedIn: (value) => startup.complete(value),
  );
  await session.restore();
  return (session: session, startup: await startup.future);
}

NotificationConsentController _controller(
  _Preference preference,
  _Source source,
  _Registration registration,
) {
  final lifecycle = FirebasePushLifecycle(
    presenter: const _Presenter(),
    onForegroundEvent: (_) => true,
    onNotificationTap: (_) {},
  );
  return NotificationConsentController(
    client: preference,
    push: PushService(
      source: source,
      client: registration,
      installationId: 'installation',
      platform: 'ios',
    ),
    lifecycle: lifecycle,
  );
}

Future<void> _settle() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

void main() {
  test(
    'failed preference read defaults off without permission or token IO',
    () async {
      final signedIn = await _signedIn();
      final preference = _Preference()..getError = StateError('offline');
      final source = _Source();
      final registration = _Registration();
      final controller = _controller(preference, source, registration);

      controller.start(signedIn.startup);
      await _settle();

      expect(controller.enabled, isFalse);
      expect(controller.failure, isNotNull);
      expect(source.currentChecks, 0);
      expect(source.prompts, 0);
      expect(source.tokenReads, 0);
      expect(registration.versions, isEmpty);
    },
  );

  test('explicit enable is the only prompt and advertises schema 1', () async {
    final signedIn = await _signedIn();
    final preference = _Preference();
    final source = _Source();
    final registration = _Registration();
    final controller = _controller(preference, source, registration);
    controller.start(signedIn.startup);
    await _settle();

    expect(await controller.setEnabled(true), isTrue);
    expect(source.prompts, 1);
    expect(source.currentChecks, 0);
    expect(preference.updates, [true]);
    expect(registration.versions, [1]);
  });

  test(
    'permission denial preserves account preference and registers nothing',
    () async {
      final signedIn = await _signedIn();
      final preference = _Preference();
      final source = _Source()..permission = PushPermission.denied;
      final registration = _Registration();
      final controller = _controller(preference, source, registration);
      controller.start(signedIn.startup);
      await _settle();

      expect(await controller.setEnabled(true), isFalse);
      expect(preference.updates, isEmpty);
      expect(registration.versions, isEmpty);
    },
  );

  test('existing opt-in checks permission without prompting', () async {
    final signedIn = await _signedIn();
    final preference = _Preference()..value = true;
    final source = _Source();
    final registration = _Registration();
    final controller = _controller(preference, source, registration);
    controller.start(signedIn.startup);
    await _settle();

    expect(controller.enabled, isTrue);
    expect(source.currentChecks, 1);
    expect(source.prompts, 0);
    expect(registration.versions, [1]);
  });

  test('clear fences a deferred old-account preference response', () async {
    final signedIn = await _signedIn();
    final pending = Completer<bool>();
    final preference = _Preference()..deferredGet = pending;
    final source = _Source();
    final registration = _Registration();
    final controller = _controller(preference, source, registration);
    controller.start(signedIn.startup);
    await controller.clear();
    pending.complete(true);
    await _settle();

    expect(controller.enabled, isFalse);
    expect(source.currentChecks, 0);
    expect(registration.versions, isEmpty);
  });
}

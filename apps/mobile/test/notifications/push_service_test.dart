import 'dart:async';

import 'package:dayli_mobile/notifications/push_service.dart';
import 'package:flutter_test/flutter_test.dart';

class _Source implements PushTokenSource {
  _Source(this.permission, this.token);
  final PushPermission permission;
  final String? token;
  final StreamController<String> controller = StreamController<String>();
  var invalidated = false;

  @override
  Future<String?> currentToken() async => token;

  @override
  Future<PushPermission> requestPermission() async => permission;

  @override
  Stream<String> get tokenRefreshes => controller.stream;

  @override
  Future<void> invalidateLocalToken() async => invalidated = true;
}

class _FailingSource extends _Source {
  _FailingSource(super.permission, super.token);

  var invalidationAttempts = 0;

  @override
  Future<void> invalidateLocalToken() async {
    invalidationAttempts++;
    throw StateError('provider deletion failed');
  }
}

class _DeferredSource implements PushTokenSource {
  _DeferredSource(this.permissions, this.tokens);

  final List<Completer<PushPermission>> permissions;
  final List<Completer<String?>> tokens;
  final StreamController<String> controller = StreamController<String>();

  @override
  Future<PushPermission> requestPermission() => permissions.removeAt(0).future;

  @override
  Future<String?> currentToken() => tokens.removeAt(0).future;

  @override
  Stream<String> get tokenRefreshes => controller.stream;

  @override
  Future<void> invalidateLocalToken() async {}
}

class _DeferredWriteClient implements PushRegistrationClient {
  _DeferredWriteClient(this.deferredTokens);

  final Set<String> deferredTokens;
  final pending = <String, Completer<void>>{};
  final observed = <String>[];
  String? serverBinding;

  @override
  Future<void> register({
    required String installationId,
    required String token,
    required String platform,
    required bool optedIn,
  }) async {
    observed.add('register-start:$token');
    if (deferredTokens.contains(token)) {
      final wait = pending.putIfAbsent(token, Completer<void>.new);
      await wait.future;
    }
    observed.add('register-commit:$token');
    serverBinding = token;
  }

  @override
  Future<void> unregister(String installationId) async {
    observed.add('unregister');
    serverBinding = null;
  }
}

class _FailingUnregisterClient extends _Client {
  var unregisterAttempts = 0;

  @override
  Future<void> unregister(String installationId) async {
    unregisterAttempts++;
    throw StateError('delete failed');
  }
}

class _Client implements PushRegistrationClient {
  final registrations = <String>[];
  final unregistrations = <String>[];

  @override
  Future<void> register({
    required String installationId,
    required String token,
    required String platform,
    required bool optedIn,
  }) async => registrations.add('$installationId:$token:$platform:$optedIn');

  @override
  Future<void> unregister(String installationId) async =>
      unregistrations.add(installationId);
}

void main() {
  test(
    'registers initial and rotated token, then unregisters on session clear',
    () async {
      final source = _Source(PushPermission.granted, 'initial-token');
      final client = _Client();
      final service = PushService(
        source: source,
        client: client,
        installationId: 'install',
        platform: 'ios',
      );
      await service.start();
      source.controller.add('rotated-token');
      await Future<void>.delayed(Duration.zero);
      await service.stop();
      expect(client.registrations, [
        'install:initial-token:ios:true',
        'install:rotated-token:ios:true',
      ]);
      expect(client.unregistrations, ['install']);
      expect(source.invalidated, isTrue);
    },
  );

  test(
    'does not register a late old-account token after stop and restart',
    () async {
      final alicePermission = Completer<PushPermission>();
      final bobPermission = Completer<PushPermission>();
      final bobToken = Completer<String?>();
      final source = _DeferredSource(
        [alicePermission, bobPermission],
        [bobToken],
      );
      final client = _Client();
      final service = PushService(
        source: source,
        client: client,
        installationId: 'install',
        platform: 'ios',
      );

      final aliceStart = service.start();
      await Future<void>.delayed(Duration.zero);
      await service.stop();
      final bobStart = service.start();
      alicePermission.complete(PushPermission.granted);
      await Future<void>.delayed(Duration.zero);
      expect(client.registrations, isEmpty);
      bobPermission.complete(PushPermission.granted);
      bobToken.complete('bob-token');
      await bobStart;
      await aliceStart;
      expect(client.registrations, ['install:bob-token:ios:true']);
    },
  );

  test(
    'drains an initial registration before unregistering old account',
    () async {
      final source = _Source(PushPermission.granted, 'alice-token');
      final client = _DeferredWriteClient({'alice-token'});
      final service = PushService(
        source: source,
        client: client,
        installationId: 'install',
        platform: 'ios',
      );

      final starting = service.start();
      await Future<void>.delayed(Duration.zero);
      expect(client.observed, ['register-start:alice-token']);
      final stopping = service.stop();
      await Future<void>.delayed(Duration.zero);
      expect(client.observed, ['register-start:alice-token']);
      client.pending['alice-token']!.complete();
      await starting;
      await stopping;
      expect(client.observed, [
        'register-start:alice-token',
        'register-commit:alice-token',
        'unregister',
      ]);
      expect(client.serverBinding, isNull);
    },
  );

  test(
    'drains a refresh registration before unregistering old account',
    () async {
      final source = _Source(PushPermission.granted, 'initial-token');
      final client = _DeferredWriteClient({'alice-refresh'});
      final service = PushService(
        source: source,
        client: client,
        installationId: 'install',
        platform: 'ios',
      );
      await service.start();
      source.controller.add('alice-refresh');
      await Future<void>.delayed(Duration.zero);
      expect(client.observed.last, 'register-start:alice-refresh');

      final stopping = service.stop();
      await Future<void>.delayed(Duration.zero);
      expect(client.observed.last, 'register-start:alice-refresh');
      client.pending['alice-refresh']!.complete();
      await stopping;
      expect(client.observed.last, 'unregister');
      expect(client.serverBinding, isNull);
    },
  );

  test('attempts local token invalidation when unregister fails', () async {
    final source = _FailingSource(PushPermission.granted, 'token');
    final client = _FailingUnregisterClient();
    final service = PushService(
      source: source,
      client: client,
      installationId: 'install',
      platform: 'ios',
    );
    await service.start();
    await expectLater(service.stop(), throwsA(isA<StateError>()));
    expect(client.unregisterAttempts, 1);
    expect(source.invalidationAttempts, 1);
  });

  test('does not request a registration when permission is denied', () async {
    final source = _Source(PushPermission.denied, null);
    final client = _Client();
    await PushService(
      source: source,
      client: client,
      installationId: 'install',
      platform: 'android',
    ).start();
    expect(client.registrations, isEmpty);
  });
}

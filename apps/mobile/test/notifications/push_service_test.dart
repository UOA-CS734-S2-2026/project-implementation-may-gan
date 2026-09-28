import 'dart:async';

import 'package:dayli_mobile/notifications/push_service.dart';
import 'package:flutter_test/flutter_test.dart';

class _Source implements PushTokenSource {
  _Source(this.permission, this.token);
  final PushPermission permission;
  final String? token;
  final StreamController<String> controller = StreamController<String>();

  @override
  Future<String?> currentToken() async => token;

  @override
  Future<PushPermission> requestPermission() async => permission;

  @override
  Stream<String> get tokenRefreshes => controller.stream;
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
    },
  );

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

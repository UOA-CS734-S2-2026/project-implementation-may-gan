import 'package:dayli_mobile/app/session_integrations.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'continues socket and cache cleanup after push cleanup throws',
    () async {
      final calls = <String>[];
      final integrations = SessionIntegrations(
        startRealtime: () async {},
        stopRealtime: () async => calls.add('socket-stop'),
        clearMessaging: () => calls.add('cache-clear'),
        stopPush: () async {
          calls.add('push-stop');
          throw StateError('unregister failed');
        },
      );

      await expectLater(integrations.clear(), throwsA(isA<StateError>()));
      expect(calls, ['push-stop', 'socket-stop', 'cache-clear']);
    },
  );
}

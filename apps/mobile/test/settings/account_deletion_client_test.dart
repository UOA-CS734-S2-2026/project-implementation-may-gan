import 'dart:convert';

import 'package:dayli_mobile/settings/account_deletion_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test(
    'uses a fresh request-specific password grant and idempotency key',
    () async {
      final requests = <http.Request>[];
      final client = HttpAccountDeletionClient(
        baseUrl: 'https://api.example.test',
        bearerToken: () async => 'session-token',
        client: MockClient((request) async {
          requests.add(request);
          if (request.url.path.endsWith('/reauthenticate/password')) {
            expect(jsonDecode(request.body), {
              'action': 'request_deletion',
              'password': 'current-password',
            });
            return http.Response(
              jsonEncode({
                'action': 'request_deletion',
                'token': 'a' * 64,
                'expiresAt': '2026-10-02T09:00:00Z',
              }),
              200,
            );
          }
          return http.Response(jsonEncode({'status': 'requested'}), 201);
        }),
      );
      await client.requestWithPassword('current-password');
      expect(requests, hasLength(2));
      expect(requests[1].url.path, '/api/v1/account/deletion/request');
      expect(requests[1].headers['idempotency-key'], startsWith('native-'));
      expect(jsonDecode(requests[1].body), {'grantToken': 'a' * 64});
    },
  );

  test(
    'parses only supported lifecycle states and cancellation deadlines',
    () async {
      final client = HttpAccountDeletionClient(
        baseUrl: 'https://api.example.test',
        bearerToken: () async => 'session-token',
        client: MockClient(
          (_) async => http.Response(
            jsonEncode({
              'state': 'pending_deletion',
              'generation': 1,
              'requestId': 'request-1',
              'requestedAt': '2026-10-02T09:00:00Z',
              'cancelUntil': '2026-10-09T09:00:00Z',
              'purgeDueAt': '2026-10-16T09:00:00Z',
            }),
            200,
          ),
        ),
      );
      final status = await client.status();
      expect(status.isPending, isTrue);
      expect(status.cancelUntil, DateTime.utc(2026, 10, 9, 9));
    },
  );
}

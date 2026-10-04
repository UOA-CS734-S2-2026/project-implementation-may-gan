import 'dart:convert';
import 'dart:io';

import 'package:dayli_mobile/settings/account_export_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const requestId = 'c09fd9f4-f274-47c3-8b8c-55fa54d9c335';

void main() {
  test('reads owner status and sends a bearer-bound request', () async {
    final operations = <String>[];
    final client = HttpAccountExportClient(
      baseUrl: 'https://api.example.test/',
      bearerToken: () async => 'native-session',
      client: MockClient((request) async {
        expect(request.headers['authorization'], 'Bearer native-session');
        operations.add('${request.method} ${request.url.path}');
        if (request.method == 'GET') {
          return http.Response(
            jsonEncode({
              'requestId': requestId,
              'status': 'ready',
              'requestedAt': '2026-10-01T00:00:00Z',
              'readyAt': '2026-10-01T02:00:00Z',
              'expiresAt': '2026-10-02T02:00:00Z',
            }),
            200,
          );
        }
        return http.Response(
          jsonEncode({
            'requestId': requestId,
            'status': 'ready',
            'requestedAt': '2026-10-01T00:00:00Z',
          }),
          200,
        );
      }),
    );
    expect((await client.status()).mayDownload, isTrue);
    await client.request();
    expect(operations, [
      'GET /api/v1/account/export',
      'POST /api/v1/account/export/request',
    ]);
  });

  test('a disabled route, malformed state, or missing bearer does not authorize an export', () async {
    final denied = HttpAccountExportClient(
      baseUrl: 'https://api.example.test',
      bearerToken: () async => null,
      client: MockClient((_) async => throw StateError('network used')),
    );
    await expectLater(denied.status(), throwsStateError);
    await expectLater(denied.request(), throwsStateError);
    final unavailable = HttpAccountExportClient(
      baseUrl: 'https://api.example.test',
      bearerToken: () async => 'token',
      client: MockClient((_) async => http.Response('{}', 503)),
    );
    await expectLater(unavailable.status(), throwsStateError);
    final malformed = HttpAccountExportClient(
      baseUrl: 'https://api.example.test',
      bearerToken: () async => 'token',
      client: MockClient(
        (_) async => http.Response(
          '{"requestId":null,"status":"ready","requestedAt":null,"readyAt":null,"expiresAt":null}',
          200,
        ),
      ),
    );
    await expectLater(malformed.status(), throwsFormatException);
    final oversized = HttpAccountExportClient(
      baseUrl: 'https://api.example.test',
      bearerToken: () async => 'token',
      client: MockClient(
        (_) async => http.Response('a' * (16 * 1024 + 1), 200),
      ),
    );
    await expectLater(oversized.status(), throwsFormatException);
  });

  test(
    'download stays streamed through the same authenticated client',
    () async {
      final client = HttpAccountExportClient(
        baseUrl: 'https://api.example.test',
        bearerToken: () async => 'token',
        client: MockClient((request) async {
          expect(request.headers['authorization'], 'Bearer token');
          return http.Response.bytes(
            [80, 75, 3, 4],
            200,
            headers: {'content-type': 'application/zip', 'content-length': '4'},
          );
        }),
      );
      final directory = await Directory.systemTemp.createTemp(
        'dayli-native-client-',
      );
      try {
        final destination = File('${directory.path}/dayli-export.zip');
        expect(
          await (await client.download(
            requestId: requestId,
            destination: destination,
          )).readAsBytes(),
          [80, 75, 3, 4],
        );
      } finally {
        await directory.delete(recursive: true);
      }
    },
  );
}

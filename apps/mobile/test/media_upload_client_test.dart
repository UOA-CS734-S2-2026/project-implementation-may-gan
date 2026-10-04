import 'dart:convert';
import 'dart:io';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/media_upload_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const uploadUrl =
    'https://account.r2.cloudflarestorage.com/bucket/media/r-1'
    '?X-Amz-Signature=secret';

Map<String, Object?> reservation({
  String url = uploadUrl,
  Object? headers = const {
    'content-type': 'image/jpeg',
    'content-length': '4',
    'if-none-match': '*',
  },
}) => {
  'id': 'reservation-1',
  'contentType': 'image/jpeg',
  'byteSize': 4,
  'status': 'pending',
  'createdAt': '2026-09-30T03:00:00.000Z',
  'expiresAt': '2026-09-30T03:15:00.000Z',
  'upload': {'url': url, 'method': 'PUT', 'requiredHeaders': headers},
};

final ticket = MediaUploadTicket(
  reservationId: 'reservation-1',
  url: Uri.parse(uploadUrl),
  requiredHeaders: const {
    'content-type': 'image/jpeg',
    'content-length': '4',
    'if-none-match': '*',
  },
);

void main() {
  late List<http.Request> requests;
  late Directory temp;
  late String photo;

  setUp(() async {
    temp = await Directory.systemTemp.createTemp('upload');
    photo = '${temp.path}/a.jpg';
    await File(photo).writeAsBytes([1, 2, 3, 4]);
  });

  tearDown(() => temp.delete(recursive: true));

  GeneratedMediaUploadClient client(
    http.Response Function(http.Request) respond, {
    String? token = 'token-1',
  }) {
    requests = [];
    return GeneratedMediaUploadClient(
      baseUrl: 'https://api.example.test/',
      bearerToken: () async => token,
      httpClient: MockClient((request) async {
        requests.add(request);
        return respond(request);
      }),
    );
  }

  group('reserve', () {
    test('reserves with the bearer session and returns the ticket', () async {
      final result = await client(
        (_) => http.Response(jsonEncode(reservation()), 201),
      ).reserve(contentType: 'image/jpeg', byteSize: 4);

      final value = (result as ApiSuccess<MediaUploadTicket>).value;
      expect(value.reservationId, 'reservation-1');
      expect(value.url, Uri.parse(uploadUrl));
      expect(value.requiredHeaders, {
        'content-type': 'image/jpeg',
        'content-length': '4',
        'if-none-match': '*',
      });
      final request = requests.single;
      expect(request.method, 'POST');
      expect(
        request.url.toString(),
        'https://api.example.test/api/v1/media-reservations',
      );
      expect(request.headers['authorization'], 'Bearer token-1');
      expect(jsonDecode(request.body), {
        'contentType': 'image/jpeg',
        'byteSize': 4,
      });
    });

    test('maps refusals to failures', () async {
      final cases = <int, Type>{
        401: Unauthenticated,
        422: InvalidRequest,
        429: RateLimited,
        503: ServiceUnavailable,
      };
      for (final MapEntry(key: status, value: type) in cases.entries) {
        final result = await client(
          (_) => http.Response('{}', status),
        ).reserve(contentType: 'image/jpeg', byteSize: 4);
        expect(
          (result as ApiError).failure.runtimeType,
          type,
          reason: '$status',
        );
      }
    });

    test('sends nothing without a session or a supported type', () async {
      final signedOut = await client(
        (_) => http.Response('{}', 201),
        token: null,
      ).reserve(contentType: 'image/jpeg', byteSize: 4);
      expect((signedOut as ApiError).failure, isA<Unauthenticated>());
      expect(requests, isEmpty);

      final unsupported = await client(
        (_) => http.Response('{}', 201),
      ).reserve(contentType: 'image/gif', byteSize: 4);
      expect((unsupported as ApiError).failure, isA<InvalidRequest>());
      expect(requests, isEmpty);
    });

    test('rejects a malformed ticket or a non-HTTPS upload URL', () async {
      for (final body in [
        {'id': 'reservation-1'},
        reservation(url: 'http://insecure.test/upload'),
        reservation(headers: {'content-type': 4}),
      ]) {
        final result = await client(
          (_) => http.Response(jsonEncode(body), 201),
        ).reserve(contentType: 'image/jpeg', byteSize: 4);
        expect((result as ApiError).failure, isA<ServiceUnavailable>());
      }
    });

    test('keeps the upload URL out of the ticket description', () {
      expect(ticket.toString(), isNot(contains('Signature')));
      expect(ticket.toString(), isNot(contains('r2.cloudflarestorage')));
    });
  });

  group('upload', () {
    test(
      'PUTs the bytes with exactly the signed headers and no session',
      () async {
        final result = await client(
          (_) => http.Response('', 200),
        ).upload(ticket, photo);

        expect(result, isA<ApiSuccess<void>>());
        final request = requests.single;
        expect(request.method, 'PUT');
        expect(request.url.toString(), uploadUrl);
        expect(request.bodyBytes, [1, 2, 3, 4]);
        expect(request.headers['content-type'], 'image/jpeg');
        expect(request.headers['if-none-match'], '*');
        expect(request.contentLength, 4);
        expect(request.headers.keys, isNot(contains('authorization')));
      },
    );

    test('treats an upload already in storage as done', () async {
      final result = await client(
        (_) => http.Response('', 412),
      ).upload(ticket, photo);
      expect(result, isA<ApiSuccess<void>>());
    });

    test('maps storage refusals and network errors', () async {
      final expired = await client(
        (_) => http.Response('', 403),
      ).upload(ticket, photo);
      expect((expired as ApiError).failure, isA<Expired>());

      final broken = await client(
        (_) => http.Response('', 500),
      ).upload(ticket, photo);
      expect((broken as ApiError).failure, isA<ServiceUnavailable>());

      final offline = await client(
        (_) => throw http.ClientException('Connection reset'),
      ).upload(ticket, photo);
      expect((offline as ApiError).failure, isA<NetworkUnavailable>());
    });

    test('refuses a missing or changed file without sending', () async {
      final missing = await client(
        (_) => http.Response('', 200),
      ).upload(ticket, '${temp.path}/gone.jpg');
      expect((missing as ApiError).failure, isA<InvalidRequest>());

      await File(photo).writeAsBytes([1, 2, 3, 4, 5]);
      final changed = await client(
        (_) => http.Response('', 200),
      ).upload(ticket, photo);
      expect((changed as ApiError).failure, isA<InvalidRequest>());
      expect(requests, isEmpty);
    });
  });

  group('complete', () {
    Future<ApiResult<MediaCheck>> complete(http.Response response) =>
        client((_) => response).complete('reservation-1');

    test('reports validated, pending, and failed checks', () async {
      final validated = await complete(
        http.Response(jsonEncode({'status': 'validated'}), 200),
      );
      expect(
        (validated as ApiSuccess<MediaCheck>).value.status,
        MediaCheckStatus.validated,
      );
      final request = requests.single;
      expect(request.method, 'POST');
      expect(
        request.url.path,
        '/api/v1/media-reservations/reservation-1/complete',
      );
      expect(request.headers['authorization'], 'Bearer token-1');

      final pending = await complete(
        http.Response(jsonEncode({'status': 'pending'}), 200),
      );
      expect(
        (pending as ApiSuccess<MediaCheck>).value.status,
        MediaCheckStatus.pending,
      );

      final failed = await complete(
        http.Response(
          jsonEncode({'status': 'failed', 'failureReason': 'format_mismatch'}),
          200,
        ),
      );
      final check = (failed as ApiSuccess<MediaCheck>).value;
      expect(check.status, MediaCheckStatus.failed);
      expect(check.failureReason, 'format_mismatch');
    });

    test('maps an expired or missing reservation', () async {
      expect(
        ((await complete(http.Response('{}', 409))) as ApiError).failure,
        isA<Expired>(),
      );
      expect(
        ((await complete(http.Response(jsonEncode({'status': 'expired'}), 200)))
                as ApiError)
            .failure,
        isA<Expired>(),
      );
      expect(
        ((await complete(http.Response('{}', 404))) as ApiError).failure,
        isA<NotFound>(),
      );
      expect(
        ((await complete(http.Response('{}', 503))) as ApiError).failure,
        isA<ServiceUnavailable>(),
      );
      expect(
        ((await complete(http.Response('not json', 200))) as ApiError).failure,
        isA<ServiceUnavailable>(),
      );
    });
  });
}

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:dayli_mobile/settings/account_export_download.dart';

const requestId = 'c09fd9f4-f274-47c3-8b8c-55fa54d9c335';

class StreamClient extends http.BaseClient {
  StreamClient(this.respond);
  final Future<http.StreamedResponse> Function(http.BaseRequest) respond;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      respond(request);
}

void main() {
  late Directory directory;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('dayli-export-test-');
  });
  tearDown(() async {
    await directory.delete(recursive: true);
  });

  test(
    'downloads bounded authenticated chunks without buffering the archive',
    () async {
      final downloader = AccountExportDownloader(
        baseUrl: 'https://api.example.test/',
        bearerToken: () async => 'native-session',
        client: StreamClient((request) async {
          expect(
            request.url.path,
            '/api/v1/account/export/$requestId/download',
          );
          expect(request.headers['authorization'], 'Bearer native-session');
          return http.StreamedResponse(
            Stream.fromIterable([
              [80, 75],
              [3, 4],
            ]),
            200,
            headers: {'content-type': 'application/zip', 'content-length': '4'},
          );
        }),
      );
      final destination = File('${directory.path}/export.zip');
      expect(
        await (await downloader.download(
          requestId: requestId,
          destination: destination,
        )).readAsBytes(),
        [80, 75, 3, 4],
      );
      await expectLater(
        downloader.download(requestId: requestId, destination: destination),
        throwsStateError,
      );
    },
  );

  test(
    'does not create files for absent sessions or invalid request IDs',
    () async {
      final downloader = AccountExportDownloader(
        baseUrl: 'https://api.example.test',
        bearerToken: () async => null,
        client: StreamClient(
          (_) async => throw StateError('network must not be used'),
        ),
      );
      final destination = File('${directory.path}/export.zip');
      await expectLater(
        downloader.download(
          requestId: '../another-user',
          destination: destination,
        ),
        throwsFormatException,
      );
      await expectLater(
        downloader.download(requestId: requestId, destination: destination),
        throwsStateError,
      );
      expect(await directory.list().toList(), isEmpty);
    },
  );

  test(
    'cleans partial downloads when a range fails or the length is wrong',
    () async {
      var responses = 0;
      final downloader = AccountExportDownloader(
        baseUrl: 'https://api.example.test',
        bearerToken: () async => 'native-session',
        client: StreamClient((_) async {
          responses++;
          return http.StreamedResponse(
            Stream.fromIterable(
              responses == 1
                  ? [
                      [1, 2],
                    ]
                  : [
                      [1, 2, 3, 4],
                    ],
            ),
            200,
            headers: {'content-type': 'application/zip', 'content-length': '3'},
          );
        }),
      );
      final destination = File('${directory.path}/export.zip');
      await expectLater(
        downloader.download(requestId: requestId, destination: destination),
        throwsStateError,
      );
      await expectLater(
        downloader.download(requestId: requestId, destination: destination),
        throwsStateError,
      );
      expect(await directory.list().toList(), isEmpty);
    },
  );

  test('rejects disabled routes and oversized advertised archives', () async {
    var response = http.StreamedResponse(const Stream<List<int>>.empty(), 503);
    final downloader = AccountExportDownloader(
      baseUrl: 'https://api.example.test',
      bearerToken: () async => 'native-session',
      client: StreamClient((_) async => response),
    );
    final destination = File('${directory.path}/export.zip');
    await expectLater(
      downloader.download(requestId: requestId, destination: destination),
      throwsStateError,
    );
    response = http.StreamedResponse(
      const Stream<List<int>>.empty(),
      200,
      headers: {
        'content-type': 'application/zip',
        'content-length': '${AccountExportDownloader.maxArchiveBytes + 1}',
      },
    );
    await expectLater(
      downloader.download(requestId: requestId, destination: destination),
      throwsStateError,
    );
    expect(await directory.list().toList(), isEmpty);
  });
}

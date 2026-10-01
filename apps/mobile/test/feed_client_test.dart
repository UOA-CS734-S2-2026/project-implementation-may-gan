import 'dart:convert';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/feed_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, Object?> item(String id, {Object? caption}) => {
  'id': id,
  'author': {
    'id': 'author-$id',
    'username': 'friend_$id',
    'displayName': 'Friend $id',
  },
  'localDate': '2026-09-24',
  'prompt': {'id': 'prompt-09-24', 'text': 'What made you smile today?'},
  'reflectiveAnswer': 'Walked to the harbour.',
  'caption': caption,
  'rating': 7,
  'audience': 'friends',
  'acceptedAt': '2026-09-24T03:00:00.000Z',
  'releasedAt': '2026-09-24T12:00:00.000Z',
  'edited': true,
};

void main() {
  late List<http.Request> requests;

  GeneratedFeedClient client(
    http.Response Function(http.Request) respond, {
    String? token = 'token-1',
  }) {
    requests = [];
    return GeneratedFeedClient(
      baseUrl: 'https://api.example.test/',
      bearerToken: () async => token,
      httpClient: MockClient((request) async {
        requests.add(request);
        return respond(request);
      }),
    );
  }

  test(
    'reads a page with the bearer session, including a null caption',
    () async {
      final result = await client(
        (_) => http.Response(
          jsonEncode({
            'items': [item('1'), item('2', caption: 'Sunset')],
            'nextCursor': 'next',
            'hasMore': true,
          }),
          200,
        ),
      ).page(cursor: 'abc');

      final request = requests.single;
      expect(request.url.path, '/api/v1/feed');
      expect(request.url.queryParameters['cursor'], 'abc');
      expect(request.headers['authorization'], 'Bearer token-1');

      final page = (result as ApiSuccess<FeedPage>).value;
      expect(page.items.map((post) => post.id), ['1', '2']);
      expect(page.items.first.caption, isNull);
      expect(page.items.last.caption, 'Sunset');
      expect(page.items.first.username, 'friend_1');
      expect(page.items.first.edited, isTrue);
      expect(page.items.first.acceptedAt, DateTime.utc(2026, 9, 24, 3));
      expect(page.nextCursor, 'next');
      expect(page.hasMore, isTrue);
    },
  );

  test('skips a malformed item instead of failing the page', () async {
    final result = await client(
      (_) => http.Response(
        jsonEncode({
          'items': [
            item('1'),
            {'id': 'broken'},
          ],
          'nextCursor': null,
          'hasMore': false,
        }),
        200,
      ),
    ).page();

    expect(
      (result as ApiSuccess<FeedPage>).value.items.map((post) => post.id),
      ['1'],
    );
  });

  test('does not call the API without a session', () async {
    final result = await client(
      (_) => http.Response('{}', 200),
      token: null,
    ).page();

    expect((result as ApiError).failure, isA<Unauthenticated>());
    expect(requests, isEmpty);
  });

  test('maps an expired session and a server failure', () async {
    final expired = await client((_) => http.Response('{}', 401)).page();
    final down = await client((_) => http.Response('{}', 503)).page();
    final garbled = await client((_) => http.Response('not json', 200)).page();

    expect((expired as ApiError).failure, isA<Unauthenticated>());
    expect((down as ApiError).failure, isA<ServiceUnavailable>());
    expect((garbled as ApiError).failure, isA<ServiceUnavailable>());
  });

  test('reads attachments in order and skips malformed ones', () async {
    Map<String, Object?> mediaJson(
      String id,
      int order, {
      Object? url = 'https://storage.example.test/a?sig=1',
    }) => {
      'id': id,
      'contentType': 'image/jpeg',
      'order': order,
      'url': url,
      'expiresAt': '2026-09-26T03:05:00.000Z',
    };

    final withMedia = {
      ...item('1'),
      'media': [
        mediaJson('m-2', 1),
        mediaJson('m-1', 0),
        {'id': 'broken'},
        mediaJson('m-3', 2, url: 'http://insecure.test/x'),
      ],
    };
    final result = await client(
      (_) => http.Response(
        jsonEncode({
          'items': [withMedia, item('2')],
          'nextCursor': null,
          'hasMore': false,
        }),
        200,
      ),
    ).page();

    final page = (result as ApiSuccess<FeedPage>).value;
    final media = page.items.first.media;
    expect(media.map((item) => item.id), ['m-1', 'm-2', 'm-3']);
    expect(media.first.url, Uri.parse('https://storage.example.test/a?sig=1'));
    expect(media.first.expiresAt, DateTime.utc(2026, 9, 26, 3, 5));
    // Only HTTPS URLs are used; anything else counts as unavailable.
    expect(media.last.url, isNull);
    expect(page.items.last.media, isEmpty);
  });

  test('treats a cursor from before midnight as expired', () async {
    final result = await client(
      (_) => http.Response(
        '{"error":{"code":"CONFLICT","details":{"reason":"feedDayChanged"}}}',
        409,
      ),
    ).page(cursor: 'c1');

    expect((result as ApiError).failure, isA<Expired>());
  });
}

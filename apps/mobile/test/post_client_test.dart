import 'dart:convert';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/post_client.dart';
import 'package:dayli_mobile/api/post_media.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, Object?> body({Object? caption, String audience = 'solo'}) => {
  'id': 'post-1',
  'author': {'id': 'author-1', 'username': 'ana_walks', 'displayName': 'Ana'},
  'localDate': '2026-09-29',
  'prompt': {'id': 'prompt-09-29', 'text': 'What made you smile today?'},
  'reflectiveAnswer': 'Walked the coastal track.',
  'caption': caption,
  'rating': 8,
  'audience': audience,
  'acceptedAt': '2026-09-29T03:00:00.000Z',
  'releasedAt': '2026-09-29T11:00:00.000Z',
  'edited': true,
  'viewerIsAuthor': true,
};

void main() {
  late List<http.Request> requests;

  GeneratedPostClient client(
    http.Response Function(http.Request) respond, {
    String? token = 'token-1',
  }) {
    requests = [];
    return GeneratedPostClient(
      baseUrl: 'https://api.example.test/',
      bearerToken: () async => token,
      httpClient: MockClient((request) async {
        requests.add(request);
        return respond(request);
      }),
    );
  }

  test(
    'reads a post with the bearer session, including a null caption',
    () async {
      final result = await client(
        (_) => http.Response(jsonEncode(body()), 200),
      ).get('post-1');

      expect(requests.single.url.path, '/api/v1/posts/post-1');
      expect(requests.single.headers['authorization'], 'Bearer token-1');
      final post = (result as ApiSuccess<PostDetail>).value;
      expect(post.caption, isNull);
      expect(post.audience, 'solo');
      expect(post.viewerIsAuthor, isTrue);
      expect(post.edited, isTrue);
      expect(post.promptText, 'What made you smile today?');
    },
  );

  test('treats a hidden, missing, or impossible post as not found', () async {
    final hidden = await client((_) => http.Response('{}', 404)).get('post-1');
    final invalid = await client((_) => http.Response('{}', 422)).get('x');

    expect((hidden as ApiError).failure, isA<NotFound>());
    expect((invalid as ApiError).failure, isA<NotFound>());
  });

  test('maps other failures and never calls without a session', () async {
    final signedOut = await client(
      (_) => http.Response('{}', 200),
      token: null,
    ).get('post-1');
    expect((signedOut as ApiError).failure, isA<Unauthenticated>());
    expect(requests, isEmpty);

    final expired = await client((_) => http.Response('{}', 401)).get('post-1');
    final down = await client((_) => http.Response('{}', 503)).get('post-1');
    final malformed = await client(
      (_) => http.Response(jsonEncode(body(audience: 'public')), 200),
    ).get('post-1');
    expect((expired as ApiError).failure, isA<Unauthenticated>());
    expect((down as ApiError).failure, isA<ServiceUnavailable>());
    expect((malformed as ApiError).failure, isA<ServiceUnavailable>());
  });

  group('media', () {
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

    test('reads the post\'s attachments', () async {
      final result = await client(
        (_) => http.Response(
          jsonEncode({
            ...body(),
            'media': [mediaJson('m-1', 0)],
          }),
          200,
        ),
      ).get('post-1');

      final post = (result as ApiSuccess<PostDetail>).value;
      expect(post.media.single.id, 'm-1');
      expect(post.media.single.isVideo, isFalse);
    });

    test('gets a fresh URL for one attachment', () async {
      final result = await client(
        (_) => http.Response(jsonEncode(mediaJson('m-1', 0)), 200),
      ).media('post-1', 'm-1');

      expect(requests.single.url.path, '/api/v1/posts/post-1/media/m-1');
      expect(requests.single.headers['authorization'], 'Bearer token-1');
      expect(
        (result as ApiSuccess<PostMedia>).value.url,
        Uri.parse('https://storage.example.test/a?sig=1'),
      );
    });

    test('maps refusals and never calls without a session', () async {
      for (final status in [404, 422]) {
        final result = await client(
          (_) => http.Response('{}', status),
        ).media('post-1', 'm-1');
        expect((result as ApiError).failure, isA<NotFound>());
      }
      final noUrl = await client(
        (_) => http.Response(jsonEncode(mediaJson('m-1', 0, url: null)), 200),
      ).media('post-1', 'm-1');
      expect((noUrl as ApiError).failure, isA<ServiceUnavailable>());

      final signedOut = await client(
        (_) => http.Response('{}', 200),
        token: null,
      ).media('post-1', 'm-1');
      expect((signedOut as ApiError).failure, isA<Unauthenticated>());
      expect(requests, isEmpty);
    });
  });
}

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

  group('profile posts', () {
    Map<String, Object?> profilePost({bool released = true}) => {
      ...body(),
      'released': released,
    };

    test(
      'reads a page with the cursor and keeps solo and unreleased posts',
      () async {
        final result = await client(
          (_) => http.Response(
            jsonEncode({
              'items': [
                profilePost(released: false),
                {'id': 'malformed'},
              ],
              'nextCursor': 'c2',
              'hasMore': true,
            }),
            200,
          ),
        ).profilePage('ana_walks', cursor: 'c1');

        expect(requests.single.url.path, '/api/v1/profiles/ana_walks/posts');
        expect(requests.single.url.queryParameters['cursor'], 'c1');
        expect(requests.single.headers['authorization'], 'Bearer token-1');
        final page = (result as ApiSuccess<ProfilePostsPage>).value;
        expect(page.items.single.audience, 'solo');
        expect(page.items.single.released, isFalse);
        expect(page.nextCursor, 'c2');
        expect(page.hasMore, isTrue);
      },
    );

    test('treats an unknown or blocked profile as not found', () async {
      final result = await client(
        (_) => http.Response('{}', 404),
      ).profilePage('nobody');

      expect(result, isA<ApiError<ProfilePostsPage>>());
      expect((result as ApiError).failure, isA<NotFound>());
    });

    test('does not call the API without a session', () async {
      final result = await client(
        (_) => http.Response('{}', 200),
        token: null,
      ).profilePage('ana_walks');

      expect((result as ApiError).failure, isA<Unauthenticated>());
      expect(requests, isEmpty);
    });
  });

  group('editing', () {
    const edit = PostEdit(
      expectedRevisionCount: 2,
      reflectiveAnswer: 'Walked further.',
      caption: null,
      rating: 9,
      audience: 'friends',
    );

    test('sends every field and returns the saved post', () async {
      final result = await client(
        (_) => http.Response(jsonEncode({...body(), 'revisionCount': 3}), 200),
      ).update('post-1', edit);

      final request = requests.single;
      expect(request.method, 'PATCH');
      expect(request.url.path, '/api/v1/posts/post-1');
      expect(jsonDecode(request.body), {
        'expectedRevisionCount': 2,
        'reflectiveAnswer': 'Walked further.',
        'caption': null,
        'rating': 9,
        'audience': 'friends',
      });
      expect((result as ApiSuccess<PostDetail>).value.revisionCount, 3);
    });

    test('reports a stale revision count as a conflict', () async {
      final result = await client(
        (_) => http.Response('{}', 409),
      ).update('post-1', edit);

      expect((result as ApiError).failure, isA<Conflict>());
    });

    test('treats someone else\'s or a deleted post as not found', () async {
      final result = await client(
        (_) => http.Response('{}', 404),
      ).update('post-1', edit);

      expect((result as ApiError).failure, isA<NotFound>());
    });
  });

  test('deletes a post by moving it to Trash', () async {
    final deleted = await client(
      (_) => http.Response(jsonEncode({'postId': 'post-1'}), 200),
    ).delete('post-1');
    expect(requests.single.method, 'POST');
    expect(requests.single.url.path, '/api/v1/posts/post-1/trash');
    expect(deleted, isA<ApiSuccess<void>>());

    final missing = await client(
      (_) => http.Response('{}', 404),
    ).delete('post-1');
    expect((missing as ApiError).failure, isA<NotFound>());

    final refused = await client(
      (_) => http.Response('{}', 409),
    ).delete('post-1');
    expect((refused as ApiError).failure, isA<Conflict>());

    // Trash is switched off until it's enabled for the environment.
    final off = await client((_) => http.Response('{}', 503)).delete('post-1');
    expect((off as ApiError).failure, isA<ServiceUnavailable>());
  });

  test('reads a page of earlier versions with its cursor', () async {
    final result = await client(
      (_) => http.Response(
        jsonEncode({
          'items': [
            {
              'revisionNumber': 2,
              'reflectiveAnswer': 'Second try.',
              'caption': null,
              'rating': 6,
              'audience': 'friends',
              'replacedAt': '2026-09-29T08:00:00.000Z',
            },
          ],
          'nextCursor': 'next',
          'hasMore': true,
        }),
        200,
      ),
    ).revisions('post-1', cursor: 'abc');

    expect(requests.single.url.path, '/api/v1/posts/post-1/revisions');
    expect(requests.single.url.queryParameters['cursor'], 'abc');
    final page = (result as ApiSuccess).value;
    expect(page.items.single.reflectiveAnswer, 'Second try.');
    expect(page.items.single.replacedAt, DateTime.utc(2026, 9, 29, 8));
    expect(page.nextCursor, 'next');

    final hidden = await client(
      (_) => http.Response('{}', 404),
    ).revisions('post-1');
    expect((hidden as ApiError).failure, isA<NotFound>());
  });
}

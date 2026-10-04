import 'dart:convert';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/interactions_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

Map<String, Object?> commentJson({String? parent, Object? editedAt}) => {
  'id': 'c-1',
  'postId': 'post-1',
  'parentCommentId': parent,
  'author': {'id': 'user-ben', 'username': 'ben', 'displayName': 'Ben'},
  'text': 'Beautiful.',
  'createdAt': '2026-09-29T20:00:00.000Z',
  'editedAt': editedAt,
  'viewerCanEdit': true,
  'viewerCanDelete': true,
};

void main() {
  late List<http.Request> requests;

  GeneratedInteractionsClient client(
    http.Response Function(http.Request) respond, {
    String? token = 'token-1',
  }) {
    requests = [];
    return GeneratedInteractionsClient(
      baseUrl: 'https://api.example.test/',
      bearerToken: () async => token,
      httpClient: MockClient((request) async {
        requests.add(request);
        return respond(request);
      }),
    );
  }

  test('likes and unlikes with the bearer session', () async {
    final summary = jsonEncode({'likeCount': 3, 'viewerHasLiked': true});
    final liked = await client((_) => http.Response(summary, 200))
        .setLike('post-1', liked: true);

    expect(requests.single.method, 'PUT');
    expect(requests.single.url.path, '/api/v1/posts/post-1/like');
    expect(requests.single.headers['authorization'], 'Bearer token-1');
    expect((liked as ApiSuccess<LikeSummary>).value.likeCount, 3);

    await client((_) => http.Response(summary, 200))
        .setLike('post-1', liked: false);
    expect(requests.single.method, 'DELETE');
  });

  test(
    'treats a hidden post as not found and never calls signed out',
    () async {
      final hidden = await client((_) => http.Response('{}', 404))
          .setLike('post-1', liked: true);
      expect((hidden as ApiError).failure, isA<NotFound>());

      final signedOut = await client(
        (_) => http.Response('{}', 200),
        token: null,
      ).comments('post-1');
      expect((signedOut as ApiError).failure, isA<Unauthenticated>());
      expect(requests, isEmpty);
    },
  );

  test('reads comments with replies, nulls, and the cursor', () async {
    final result = await client(
      (_) => http.Response(
        jsonEncode({
          'items': [
            commentJson(),
            commentJson(parent: 'c-0', editedAt: '2026-09-30T01:00:00.000Z'),
          ],
          'nextCursor': 'next',
          'hasMore': true,
        }),
        200,
      ),
    ).comments('post-1', cursor: 'abc');

    expect(requests.single.url.path, '/api/v1/posts/post-1/comments');
    expect(requests.single.url.queryParameters['cursor'], 'abc');
    final page = (result as ApiSuccess).value;
    expect(page.items.first.parentCommentId, isNull);
    expect(page.items.first.editedAt, isNull);
    expect(page.items.last.parentCommentId, 'c-0');
    expect(page.items.last.editedAt, DateTime.utc(2026, 9, 30, 1));
    expect(page.nextCursor, 'next');
  });

  test('creates a comment with its client ID and accepts a replay', () async {
    final created = await client(
      (_) => http.Response(jsonEncode(commentJson()), 201),
    ).createComment('post-1', clientCommentId: 'id-1', text: 'Beautiful.');

    expect(requests.single.method, 'POST');
    expect(jsonDecode(requests.single.body), {
      'clientCommentId': 'id-1',
      'text': 'Beautiful.',
      'parentCommentId': null,
    });
    expect((created as ApiSuccess<PostComment>).value.id, 'c-1');

    final replayed = await client(
      (_) => http.Response(jsonEncode(commentJson()), 200),
    ).createComment('post-1', clientCommentId: 'id-1', text: 'Beautiful.');
    expect(replayed, isA<ApiSuccess<PostComment>>());

    final reused = await client((_) => http.Response('{}', 409))
        .createComment('post-1', clientCommentId: 'id-1', text: 'Other');
    expect((reused as ApiError).failure, isA<Conflict>());
  });

  test('edits and deletes a comment', () async {
    final edited = await client(
      (_) => http.Response(jsonEncode(commentJson()), 200),
    ).updateComment('post-1', 'c-1', 'Stunning.');
    expect(requests.single.method, 'PATCH');
    expect(requests.single.url.path, '/api/v1/posts/post-1/comments/c-1');
    expect(jsonDecode(requests.single.body), {'text': 'Stunning.'});
    expect(edited, isA<ApiSuccess<PostComment>>());

    final deleted = await client((_) => http.Response('', 204))
        .deleteComment('post-1', 'c-1');
    expect(requests.single.method, 'DELETE');
    expect(deleted, isA<ApiSuccess<void>>());
  });
}

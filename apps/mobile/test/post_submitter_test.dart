import 'dart:convert';
import 'dart:io';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

DailyPostDraft draft({
  String answer = '  Coffee by the harbour  ',
  String caption = '',
  String tomorrowNote = '',
  PostAudience? audience = PostAudience.friends,
}) => DailyPostDraft(
  userId: 'user-1',
  localDate: '2026-09-25',
  promptId: 'prompt-09-25',
  promptText: 'What made you smile today?',
  idempotencyKey: '0f8fad5b-d9cb-469f-a165-70867728950e',
  updatedAt: DateTime.utc(2026, 9, 25),
  reflectiveAnswer: answer,
  caption: caption,
  rating: 7,
  audience: audience,
  tomorrowNote: tomorrowNote,
  attachments: const [
    DraftAttachment(localPath: '/photos/0.jpg', mediaType: 'image'),
  ],
);

String post({String id = 'post-1'}) => jsonEncode({
  'id': id,
  'authorId': 'user-1',
  'localDate': '2026-09-25',
  'prompt': {'id': 'prompt-09-25', 'text': 'What made you smile today?'},
  'reflectiveAnswer': 'Coffee by the harbour',
  'caption': null,
  'rating': 7,
  'audience': 'friends',
  'acceptedAt': '2026-09-25T03:00:00.000Z',
  'releasedAt': '2026-09-25T12:00:00.000Z',
  'tomorrowNote': null,
});

String conflict(String reason) => jsonEncode({
  'error': {
    'code': 'CONFLICT',
    'message': 'The post could not be accepted.',
    'requestId': 'req_1',
    'details': {'reason': reason},
  },
});

void main() {
  late List<http.Request> requests;
  late String? token;

  GeneratedPostSubmitter submitter(
    Future<http.Response> Function(http.Request) respond,
  ) => GeneratedPostSubmitter(
    baseUrl: 'https://api.example.test/',
    bearerToken: () async => token,
    httpClient: MockClient((request) {
      requests.add(request);
      return respond(request);
    }),
  );

  setUp(() {
    requests = [];
    token = 'token-1';
  });

  test('sends a trimmed text-only body with the draft key', () async {
    final result = await submitter(
      (_) async => http.Response(post(), 201),
    ).submit(draft());

    expect(result, isA<SubmissionAccepted>());
    expect((result as SubmissionAccepted).postId, 'post-1');
    expect(result.replayed, isFalse);

    final request = requests.single;
    expect(request.method, 'POST');
    expect(request.url.toString(), 'https://api.example.test/api/v1/posts');
    expect(request.headers['authorization'], 'Bearer token-1');
    expect(
      request.headers['idempotency-key'],
      '0f8fad5b-d9cb-469f-a165-70867728950e',
    );
    // Blank optional fields are omitted, never sent as null, and media stays
    // on the device.
    expect(jsonDecode(request.body), {
      'localDate': '2026-09-25',
      'promptId': 'prompt-09-25',
      'reflectiveAnswer': 'Coffee by the harbour',
      'rating': 7,
      'audience': 'friends',
    });
  });

  test('sends the caption, tomorrow note, and solo audience', () async {
    await submitter((_) async => http.Response(post(), 201)).submit(
      draft(
        caption: ' Sunset at the wharf ',
        tomorrowNote: '\nBring the camera.\n',
        audience: PostAudience.solo,
      ),
    );

    final body = jsonDecode(requests.single.body) as Map<String, dynamic>;
    expect(body['caption'], 'Sunset at the wharf');
    expect(body['tomorrowNote'], 'Bring the camera.');
    expect(body['audience'], 'solo');
  });

  test('reports a replayed acceptance', () async {
    final result = await submitter(
      (_) async =>
          http.Response(post(), 201, headers: {'idempotent-replayed': 'true'}),
    ).submit(draft());

    expect((result as SubmissionAccepted).replayed, isTrue);
  });

  for (final conflictReason in SubmissionConflict.values) {
    test('maps a ${conflictReason.reason} conflict', () async {
      final result = await submitter(
        (_) async => http.Response(conflict(conflictReason.reason), 409),
      ).submit(draft());

      expect((result as SubmissionRejected).conflict, conflictReason);
    });
  }

  for (final (name, response, failure) in [
    (
      'an unknown conflict',
      http.Response(conflict('SOMETHING_NEW'), 409),
      isA<ServiceUnavailable>(),
    ),
    ('an expired session', http.Response('{}', 401), isA<Unauthenticated>()),
    ('invalid fields', http.Response('{}', 422), isA<InvalidRequest>()),
    ('an outage', http.Response('{}', 503), isA<ServiceUnavailable>()),
    (
      'an acceptance without a post',
      http.Response('{}', 201),
      isA<ServiceUnavailable>(),
    ),
  ]) {
    test('maps $name to a failure', () async {
      final result = await submitter((_) async => response).submit(draft());

      expect((result as SubmissionFailed).failure, failure);
    });
  }

  test('reports a lost connection as offline', () async {
    final result = await submitter(
      (_) async => throw const SocketException('offline'),
    ).submit(draft());

    expect((result as SubmissionFailed).failure, isA<NetworkUnavailable>());
  });

  test('does not send without a stored session', () async {
    token = null;
    final result = await submitter(
      (_) async => http.Response(post(), 201),
    ).submit(draft());

    expect((result as SubmissionFailed).failure, isA<Unauthenticated>());
    expect(requests, isEmpty);
  });

  test('does not send a draft without a chosen audience', () async {
    final result = await submitter(
      (_) async => http.Response(post(), 201),
    ).submit(draft(audience: null));

    expect((result as SubmissionFailed).failure, isA<InvalidRequest>());
    expect(requests, isEmpty);
  });
}

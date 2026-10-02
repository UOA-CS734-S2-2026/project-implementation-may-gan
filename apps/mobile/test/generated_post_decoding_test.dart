import 'package:dayli_api_client/api.dart' as generated;
import 'package:flutter_test/flutter_test.dart';

// These decode through the generated models, which the app's own post parsers
// avoid. They guard the OpenAPI document's nullability for `voiceMemo`: a
// post without a voice memo sends `voiceMemo: null`, and the generated model
// must accept it instead of asserting non-null and force-unwrapping.
//
// They live here, not in packages/api-client-dart/test, because
// `pnpm generate:clients` deletes and rebuilds that whole package.

Map<String, dynamic> _postDetail(Map<String, dynamic> extra) => {
  'id': 'post-1',
  'author': {'id': 'user-1', 'username': 'friend', 'displayName': 'Friend'},
  'localDate': '2026-09-25',
  'prompt': {'id': 'prompt-1', 'text': 'What made you smile today?'},
  'reflectiveAnswer': 'Walked to the harbour.',
  'caption': 'Sunset',
  'rating': 7,
  'audience': 'friends',
  'acceptedAt': '2026-09-25T03:00:00.000Z',
  'releasedAt': '2026-09-25T12:00:00.000Z',
  'edited': false,
  'viewerIsAuthor': false,
  'media': <Object>[],
  'voiceMemo': null,
  ...extra,
};

Map<String, dynamic> _dailyPost(Map<String, dynamic> extra) => {
  'id': 'post-1',
  'authorId': 'user-1',
  'localDate': '2026-09-25',
  'prompt': {'id': 'prompt-1', 'text': 'What made you smile today?'},
  'reflectiveAnswer': 'Walked to the harbour.',
  'caption': 'Sunset',
  'rating': 7,
  'audience': 'friends',
  'acceptedAt': '2026-09-25T03:00:00.000Z',
  'releasedAt': '2026-09-25T12:00:00.000Z',
  'tomorrowNote': {'availableOn': '2026-09-26'},
  'media': <Object>[],
  'voiceMemo': null,
  ...extra,
};

void main() {
  group('PostDetail voiceMemo', () {
    test('decodes an ordinary post whose voiceMemo is null', () {
      final post = generated.PostDetail.fromJson(_postDetail({}));

      expect(post, isNotNull);
      expect(post!.id, 'post-1');
      expect(post.voiceMemo, isNull);
    });

    test('keeps a null voiceMemo as an explicit null when encoding', () {
      final json = generated.PostDetail.fromJson(_postDetail({}))!.toJson();

      expect(json.containsKey('voiceMemo'), isTrue);
      expect(json['voiceMemo'], isNull);
    });

    test('decodes a post with a voice memo', () {
      final post = generated.PostDetail.fromJson(
        _postDetail({
          'voiceMemo': {
            'id': 'media-9',
            'contentType': 'audio/mp4',
            'url': 'https://storage.example.test/memo?signature=abc',
            'expiresAt': '2026-09-26T03:05:00.000Z',
          },
        }),
      );

      expect(post!.voiceMemo, isNotNull);
      expect(post.voiceMemo!.id, 'media-9');
      expect(
        post.voiceMemo!.contentType,
        generated.VoiceMemoContentType.audioSlashMp4,
      );
    });
  });

  group('DailyPost voiceMemo', () {
    test('decodes a created post whose voiceMemo is null', () {
      final post = generated.DailyPost.fromJson(_dailyPost({}));

      expect(post, isNotNull);
      expect(post!.voiceMemo, isNull);
    });

    test('decodes a created post with a voice memo', () {
      final post = generated.DailyPost.fromJson(
        _dailyPost({
          'voiceMemo': {'id': 'media-9', 'contentType': 'audio/mp4'},
        }),
      );

      expect(post!.voiceMemo!.id, 'media-9');
    });
  });
}

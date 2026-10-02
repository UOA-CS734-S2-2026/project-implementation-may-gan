import 'package:dayli_api_client/api.dart';
import 'package:flutter_test/flutter_test.dart';

// Guards #195: the OpenAPI document must declare the version its generator
// writes, or the generated Dart models lose nullability and reject real nulls.
void main() {
  test('PostDetail accepts a null caption', () {
    final post = PostDetail.fromJson({
      'id': 'post-1',
      'author': {'id': 'user-1', 'username': 'ana', 'displayName': 'Ana'},
      'localDate': '2026-10-01',
      'prompt': {'id': 'prompt-1', 'text': 'What made today?'},
      'reflectiveAnswer': 'A walk.',
      'caption': null,
      'rating': 4,
      'audience': 'friends',
      'acceptedAt': '2026-10-01T09:00:00.000Z',
      'releasedAt': '2026-10-01T11:00:00.000Z',
      'edited': false,
      'viewerIsAuthor': false,
      'media': <Object>[],
      'voiceMemo': null,
    });

    expect(post, isNotNull);
    expect(post!.caption, isNull);
  });

  test('Message accepts null text, reply, and timestamps', () {
    final message = Message.fromJson({
      'id': 'message-1',
      'conversationId': 'conversation-1',
      'sequence': '1',
      'senderId': 'user-1',
      'clientMessageId': 'client-1',
      'text': null,
      'replyToMessageId': null,
      'replyPreview': null,
      'version': 1,
      'createdAt': '2026-10-01T09:00:00.000Z',
      'editedAt': null,
      'unsentAt': null,
      'reactions': <Object>[],
    });

    expect(message, isNotNull);
    expect(message!.text, isNull);
    expect(message.replyPreview, isNull);
    expect(message.editedAt, isNull);
    expect(message.unsentAt, isNull);
    expect(message.createdAt, DateTime.utc(2026, 10, 1, 9));
  });
}

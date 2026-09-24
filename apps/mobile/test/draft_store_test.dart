import 'dart:convert';

import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/drafts/draft_store.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

DailyPostDraft draft({String userId = 'user-1'}) => DailyPostDraft(
  userId: userId,
  localDate: '2026-09-25',
  promptId: 'prompt-09-25',
  promptText: 'What made you smile today?',
  idempotencyKey: 'key-1',
  updatedAt: DateTime.utc(2026, 9, 25, 3),
  reflectiveAnswer: 'Coffee by the harbour 😀',
  caption: 'Sunset',
  rating: 8,
  audience: PostAudience.solo,
  tomorrowNote: 'Bring the camera.',
  attachments: const [
    DraftAttachment(localPath: '/tmp/a.jpg', mediaType: 'image/jpeg'),
  ],
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test(
    'round-trips a draft, including attachment references, per user',
    () async {
      final store = ProtectedDraftStore();
      await store.write(draft());

      final result = await store.read('user-1');
      expect(result.discarded, isFalse);
      expect(result.draft!.toJson(), draft().toJson());
      expect((await store.read('user-2')).draft, isNull);
    },
  );

  test('survives a restart by reading from a new store instance', () async {
    await ProtectedDraftStore().write(draft());
    expect((await ProtectedDraftStore().read('user-1')).draft?.rating, 8);
  });

  test('clears only the requested user', () async {
    final store = ProtectedDraftStore();
    await store.write(draft());
    await store.write(draft(userId: 'user-2'));
    await store.clear('user-1');

    expect((await store.read('user-1')).draft, isNull);
    expect((await store.read('user-2')).draft, isNotNull);
  });

  test('discards corrupted, future-format, and mismatched entries', () async {
    for (final raw in [
      'not json',
      jsonEncode({...draft().toJson(), 'version': 2}),
      jsonEncode(draft(userId: 'someone-else').toJson()),
    ]) {
      FlutterSecureStorage.setMockInitialValues({
        '${ProtectedDraftStore.keyPrefix}user-1': raw,
      });
      final store = ProtectedDraftStore();
      final result = await store.read('user-1');

      expect(result.draft, isNull);
      expect(result.discarded, isTrue);
      expect((await store.read('user-1')).discarded, isFalse);
    }
  });

  test('rejects out-of-range ratings rather than trusting stored data', () {
    final parsed = DailyPostDraft.fromJson({...draft().toJson(), 'rating': 11});
    expect(parsed?.rating, isNull);
  });
}

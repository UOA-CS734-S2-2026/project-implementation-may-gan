import 'package:dayli_mobile/compose/pending_capture.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

/// A throwing store, for the failures a protected store can have.
class BrokenStore implements PendingCaptureStore {
  BrokenStore({this.failRead = false, this.failWrite = false});

  final bool failRead;
  final bool failWrite;

  @override
  Future<void> clear() async {}

  @override
  Future<PendingCapture?> read() async {
    if (failRead) throw StateError('keystore unavailable');
    return null;
  }

  @override
  Future<void> write(PendingCapture capture) async {
    if (failWrite) throw StateError('keystore unavailable');
  }
}

void main() {
  const alice = 'user-alice';
  const bob = 'user-bob';
  const todaysDraft = '2026-09-25:key-1';
  const otherDraft = '2026-09-24:key-0';

  final photo = DraftAttachment(
    localPath: '/cache/alice-photo.jpg',
    mediaType: 'image',
  );

  late MemoryPendingCaptureStore store;
  late List<String> deleted;
  late DateTime now;
  late PendingCaptures captures;

  setUp(() {
    store = MemoryPendingCaptureStore();
    deleted = [];
    now = DateTime.utc(2026, 9, 25, 3);
    captures = PendingCaptures(
      store: store,
      deleteFile: (path) async => deleted.add(path),
      clock: () => now,
    );
  });

  group('recording who starts a pick', () {
    test('writes the user, the draft and the time before the pick', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);

      expect(store.value?.userId, alice);
      expect(store.value?.draftKey, todaysDraft);
      expect(store.value?.startedAt, now);
    });

    test('is cleared when the pick comes back normally', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);
      await captures.finish();

      expect(store.value, isNull);
    });

    test('replaces an earlier record and removes the file it held', () async {
      store.value = PendingCapture(
        userId: bob,
        draftKey: todaysDraft,
        startedAt: now,
        recovered: photo,
      );

      await captures.begin(userId: alice, draftKey: todaysDraft);

      expect(store.value?.userId, alice);
      expect(store.value?.recovered, isNull);
      expect(deleted, [photo.localPath]);
    });

    test('a record that can not be written leaves the pick unowned', () async {
      final unwritable = PendingCaptures(
        store: BrokenStore(failWrite: true),
        deleteFile: (path) async => deleted.add(path),
        clock: () => now,
      );

      // Starting a pick never fails because the record could not be kept.
      await unwritable.begin(userId: alice, draftKey: todaysDraft);
      final recovered = await unwritable.recover(
        userId: alice,
        draftKey: todaysDraft,
        lost: photo,
      );

      expect(recovered, isNull);
      expect(deleted, [photo.localPath]);
    });
  });

  group('recovering what the system handed back', () {
    test('gives it to the user and draft that started the pick', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);

      final recovered = await captures.recover(
        userId: alice,
        draftKey: todaysDraft,
        lost: photo,
      );

      expect(recovered?.localPath, photo.localPath);
      expect(store.value, isNull);
      expect(deleted, isEmpty);
    });

    test('never gives it to another account that signs in first', () async {
      // Alice starts a capture and Android ends the app. Bob signs in and opens
      // his composer before Alice does.
      await captures.begin(userId: alice, draftKey: todaysDraft);

      final recovered = await captures.recover(
        userId: bob,
        draftKey: todaysDraft,
        lost: photo,
      );

      expect(recovered, isNull);
      // Kept for Alice, not deleted and not handed to Bob.
      expect(deleted, isEmpty);
      expect(store.value?.userId, alice);
      expect(store.value?.recovered?.localPath, photo.localPath);
    });

    test('hands it to Alice when she opens her composer afterwards', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);
      await captures.recover(userId: bob, draftKey: todaysDraft, lost: photo);

      // The system returns it only once, so Alice's composer finds nothing new.
      final bobAgain = await captures.recover(
        userId: bob,
        draftKey: todaysDraft,
        lost: null,
      );
      expect(bobAgain, isNull);
      expect(store.value?.recovered?.localPath, photo.localPath);

      final recovered = await captures.recover(
        userId: alice,
        draftKey: todaysDraft,
        lost: null,
      );
      expect(recovered?.localPath, photo.localPath);
      expect(recovered?.mediaType, 'image');
      expect(store.value, isNull);
    });

    test('never gives it to the same user\'s other draft', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);

      final recovered = await captures.recover(
        userId: alice,
        draftKey: otherDraft,
        lost: photo,
      );

      expect(recovered, isNull);
      expect(store.value?.draftKey, todaysDraft);
      expect(store.value?.recovered?.localPath, photo.localPath);
      expect(deleted, isEmpty);
    });

    test('removes it when no one recorded starting the pick', () async {
      final recovered = await captures.recover(
        userId: alice,
        draftKey: todaysDraft,
        lost: photo,
      );

      expect(recovered, isNull);
      expect(deleted, [photo.localPath]);
    });

    test('removes it when the record can not be read', () async {
      final unreadable = PendingCaptures(
        store: BrokenStore(failRead: true),
        deleteFile: (path) async => deleted.add(path),
        clock: () => now,
      );

      final recovered = await unreadable.recover(
        userId: alice,
        draftKey: todaysDraft,
        lost: photo,
      );

      expect(recovered, isNull);
      expect(deleted, [photo.localPath]);
    });

    test('gives up on a pick its owner never came back for', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);
      await captures.recover(userId: bob, draftKey: todaysDraft, lost: photo);

      now = now.add(const Duration(hours: 25));
      final recovered = await captures.recover(
        userId: alice,
        draftKey: todaysDraft,
        lost: null,
      );

      expect(recovered, isNull);
      expect(deleted, [photo.localPath]);
      expect(store.value, isNull);
    });

    test('does not use a late result against an expired record', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);
      now = now.add(const Duration(hours: 25));

      final recovered = await captures.recover(
        userId: alice,
        draftKey: todaysDraft,
        lost: photo,
      );

      expect(recovered, isNull);
      expect(deleted, [photo.localPath]);
      expect(store.value, isNull);
    });

    test('clears the owner\'s record when the system had nothing', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);

      final recovered = await captures.recover(
        userId: alice,
        draftKey: todaysDraft,
        lost: null,
      );

      expect(recovered, isNull);
      expect(store.value, isNull);
    });

    test(
      'leaves another user\'s record alone when the system had nothing',
      () async {
        await captures.begin(userId: alice, draftKey: todaysDraft);

        final recovered = await captures.recover(
          userId: bob,
          draftKey: todaysDraft,
          lost: null,
        );

        expect(recovered, isNull);
        expect(store.value?.userId, alice);
      },
    );
  });

  group('at sign-out', () {
    test('removes the user\'s record and the file held for them', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);
      await captures.recover(userId: bob, draftKey: todaysDraft, lost: photo);

      await captures.discardFor(alice);

      expect(store.value, isNull);
      expect(deleted, [photo.localPath]);
    });

    test('leaves another user\'s record alone', () async {
      await captures.begin(userId: alice, draftKey: todaysDraft);

      await captures.discardFor(bob);

      expect(store.value?.userId, alice);
      expect(deleted, isEmpty);
    });
  });

  group('the stored record', () {
    test('survives a round trip, with and without a held file', () {
      final plain = PendingCapture(
        userId: alice,
        draftKey: todaysDraft,
        startedAt: now,
      );
      final held = plain.holding(photo);

      final plainBack = PendingCapture.fromJson(plain.toJson());
      final heldBack = PendingCapture.fromJson(held.toJson());

      expect(plainBack?.userId, alice);
      expect(plainBack?.recovered, isNull);
      expect(heldBack?.recovered?.localPath, photo.localPath);
      expect(heldBack?.recovered?.mediaType, 'image');
      expect(heldBack?.startedAt, now);
    });

    test('rejects anything that does not name an owner and a time', () {
      expect(PendingCapture.fromJson(null), isNull);
      expect(PendingCapture.fromJson({'userId': alice}), isNull);
      expect(
        PendingCapture.fromJson({
          'userId': alice,
          'draftKey': todaysDraft,
          'startedAt': 'yesterday-ish',
        }),
        isNull,
      );
    });
  });
}

import 'dart:convert';

import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/drafts/draft_store.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

const picked = DraftAttachment(
  localPath: '/picked/IMG_0001.HEIC',
  mediaType: 'image',
);

const validated = DraftAttachment(
  localPath: '/picked/IMG_0001.HEIC',
  mediaType: 'image',
  compressedPath: '/support/media/a.jpg',
  contentType: 'image/jpeg',
  byteSize: 812345,
  reservationId: 'reservation-1',
  status: AttachmentUploadStatus.validated,
);

Map<String, Object?> draftJson(List<Object?> attachments) => {
  'version': 1,
  'userId': 'user-1',
  'localDate': '2026-09-30',
  'promptId': 'prompt-09-30',
  'promptText': 'What made you smile today?',
  'idempotencyKey': 'key-1',
  'updatedAt': '2026-09-30T03:00:00.000Z',
  'attachments': attachments,
};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('keeps the version 1 format', () {
    expect(DailyPostDraft.schemaVersion, 1);
  });

  test('saves an attachment without upload state in the original shape', () {
    expect(picked.toJson(), {
      'localPath': '/picked/IMG_0001.HEIC',
      'mediaType': 'image',
    });
  });

  test('loads attachments saved before uploads existed as pending', () {
    final draft = DailyPostDraft.fromJson(
      draftJson([
        {'localPath': '/photos/0.jpg', 'mediaType': 'image'},
      ]),
    )!;
    final attachment = draft.attachments.single;
    expect(attachment.localPath, '/photos/0.jpg');
    expect(attachment.status, AttachmentUploadStatus.pending);
    expect(attachment.compressedPath, isNull);
    expect(attachment.contentType, isNull);
    expect(attachment.byteSize, isNull);
    expect(attachment.reservationId, isNull);
    expect(attachment.failureReason, isNull);
  });

  test('round-trips every upload field', () {
    final failed = validated.copyWith(
      status: AttachmentUploadStatus.failed,
      failureReason: () => 'format_mismatch',
    );
    for (final attachment in [validated, failed]) {
      final restored = DraftAttachment.fromJson(
        jsonDecode(jsonEncode(attachment.toJson())),
      )!;
      expect(restored.toJson(), attachment.toJson());
    }
  });

  test('retries an unknown status rather than trusting it', () {
    final restored = DraftAttachment.fromJson({
      ...validated.toJson(),
      'status': 'processing',
    })!;
    expect(restored.status, AttachmentUploadStatus.pending);
    expect(restored.reservationId, 'reservation-1');
  });

  test('uploads again when a later status has no reservation', () {
    for (final status in ['uploading', 'validated', 'failed']) {
      final restored = DraftAttachment.fromJson({
        'localPath': '/photos/0.jpg',
        'mediaType': 'image',
        'status': status,
        'failureReason': 'format_mismatch',
      })!;
      expect(restored.status, AttachmentUploadStatus.pending, reason: status);
      expect(restored.failureReason, isNull, reason: status);
    }
  });

  test('keeps a failure reason only on a failed attachment', () {
    final restored = DraftAttachment.fromJson({
      ...validated.toJson(),
      'failureReason': 'format_mismatch',
    })!;
    expect(restored.status, AttachmentUploadStatus.validated);
    expect(restored.failureReason, isNull);
  });

  test('drops malformed upload fields but keeps the attachment', () {
    final restored = DraftAttachment.fromJson({
      'localPath': '/photos/0.jpg',
      'mediaType': 'image',
      'compressedPath': 42,
      'contentType': '',
      'byteSize': -1,
      'reservationId': ['reservation-1'],
    })!;
    expect(restored.localPath, '/photos/0.jpg');
    expect(restored.compressedPath, isNull);
    expect(restored.contentType, isNull);
    expect(restored.byteSize, isNull);
    expect(restored.reservationId, isNull);
  });

  test('clears a reservation and failure reason through copyWith', () {
    final failed = validated.copyWith(
      status: AttachmentUploadStatus.failed,
      failureReason: () => 'object_not_found',
    );
    final retry = failed.copyWith(
      reservationId: () => null,
      status: AttachmentUploadStatus.pending,
      failureReason: () => null,
    );
    expect(retry.reservationId, isNull);
    expect(retry.failureReason, isNull);
    expect(retry.compressedPath, '/support/media/a.jpg');
    expect(retry.byteSize, 812345);
  });

  test('survives the protected store with its upload state', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final store = ProtectedDraftStore();
    final draft = DailyPostDraft.fromJson(draftJson([]))!
        .copyWith(attachments: const [validated]);
    await store.write(draft);

    final restored = (await ProtectedDraftStore().read('user-1')).draft!;
    expect(restored.attachments.single.toJson(), validated.toJson());
  });

  group('a voice memo', () {
    const memo = DraftAttachment(
      localPath: '/support/dayli-media/user-1/memo.m4a',
      mediaType: 'audio',
      compressedPath: '/support/dayli-media/user-1/memo.m4a',
      contentType: 'audio/mp4',
      byteSize: 400000,
      durationMs: 21000,
      waveform: [10, 90, 200, 40],
      reservationId: 'reservation-1',
      status: AttachmentUploadStatus.validated,
    );

    test('is told apart from photos and video', () {
      expect(memo.isVoiceMemo, isTrue);
      expect(picked.isVoiceMemo, isFalse);
      expect(DraftAttachment.voiceMemoMediaType, 'audio');
    });

    test('keeps its length and waveform through storage', () {
      final restored = DraftAttachment.fromJson(
        jsonDecode(jsonEncode(memo.toJson())),
      );

      expect(restored, memo);
      expect(restored!.durationMs, 21000);
      expect(restored.waveform, [10, 90, 200, 40]);
      expect(restored.status, AttachmentUploadStatus.validated);
    });

    test(
      'writes neither field for a photo, so older readers see no change',
      () {
        final json = validated.toJson();

        expect(json.containsKey('durationMs'), isFalse);
        expect(json.containsKey('waveform'), isFalse);
      },
    );

    test('loads a draft saved before voice memos existed', () {
      final restored = DraftAttachment.fromJson(validated.toJson());

      expect(restored!.durationMs, isNull);
      expect(restored.waveform, isNull);
      expect(restored, validated);
    });

    test('drops a malformed length or waveform without losing the memo', () {
      for (final bad in [
        {'durationMs': 0},
        {'durationMs': -5},
        {'durationMs': '21000'},
        {
          'waveform': [10, 300],
        },
        {
          'waveform': [10, -1],
        },
        {
          'waveform': [10, 'loud'],
        },
        {
          'waveform': [10.5, 20],
        },
        {'waveform': 'loud'},
      ]) {
        final restored = DraftAttachment.fromJson({...memo.toJson(), ...bad})!;

        expect(restored.localPath, memo.localPath, reason: '$bad');
        expect(restored.reservationId, 'reservation-1', reason: '$bad');
        expect(
          restored.status,
          AttachmentUploadStatus.validated,
          reason: '$bad',
        );
        if (bad.containsKey('durationMs')) {
          expect(restored.durationMs, isNull, reason: '$bad');
          expect(restored.waveform, [10, 90, 200, 40], reason: '$bad');
        } else {
          expect(restored.waveform, isNull, reason: '$bad');
          expect(restored.durationMs, 21000, reason: '$bad');
        }
      }
    });

    test('compares by value, including the waveform', () {
      final same = DraftAttachment.fromJson(memo.toJson())!;
      final other = DraftAttachment.fromJson({
        ...memo.toJson(),
        'waveform': [10, 90, 200, 41],
      })!;

      expect(same, memo);
      expect(same.hashCode, memo.hashCode);
      expect(other, isNot(memo));
    });

    test('copying keeps its length and waveform', () {
      final copy = memo.copyWith(status: AttachmentUploadStatus.failed);

      expect(copy.durationMs, 21000);
      expect(copy.waveform, [10, 90, 200, 40]);
    });

    group('forgetting its reservation', () {
      test('resets the upload state and keeps everything else', () {
        final again = memo.withoutReservation();

        expect(again.reservationId, isNull);
        expect(again.status, AttachmentUploadStatus.pending);
        expect(again.failureReason, isNull);
        expect(again.localPath, memo.localPath);
        expect(again.compressedPath, memo.compressedPath);
        expect(again.contentType, 'audio/mp4');
        expect(again.byteSize, 400000);
        expect(again.durationMs, 21000);
        expect(again.waveform, [10, 90, 200, 40]);
      });

      test('clears a rejection too, so the next try is clean', () {
        final failed = memo.copyWith(
          status: AttachmentUploadStatus.failed,
          failureReason: () => 'malformed_container',
        );

        final again = failed.withoutReservation();

        expect(again.status, AttachmentUploadStatus.pending);
        expect(again.failureReason, isNull);
        expect(again.durationMs, 21000);
        expect(again.waveform, [10, 90, 200, 40]);
      });

      test('does the same for a photo', () {
        final again = validated.withoutReservation();

        expect(again.reservationId, isNull);
        expect(again.status, AttachmentUploadStatus.pending);
        expect(again.compressedPath, validated.compressedPath);
        expect(again.byteSize, validated.byteSize);
      });
    });

    group('restarting', () {
      test('keeps the recording, which is never recompressed', () {
        final again = memo.restarted();

        expect(again.compressedPath, memo.compressedPath);
        expect(again.contentType, 'audio/mp4');
        expect(again.byteSize, 400000);
        expect(again.durationMs, 21000);
        expect(again.waveform, [10, 90, 200, 40]);
        expect(again.reservationId, isNull);
        expect(again.status, AttachmentUploadStatus.pending);
      });

      test('still starts a photo over from compression', () {
        final again = validated.restarted();

        expect(again.compressedPath, isNull);
        expect(again.contentType, isNull);
        expect(again.byteSize, isNull);
        expect(again.reservationId, isNull);
      });
    });
  });
}

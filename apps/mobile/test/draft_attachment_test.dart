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
    final draft = DailyPostDraft.fromJson(
      draftJson([]),
    )!.copyWith(attachments: const [validated]);
    await store.write(draft);

    final restored = (await ProtectedDraftStore().read('user-1')).draft!;
    expect(restored.attachments.single.toJson(), validated.toJson());
  });
}

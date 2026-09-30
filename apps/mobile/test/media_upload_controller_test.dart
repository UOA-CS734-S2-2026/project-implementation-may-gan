import 'dart:async';
import 'dart:convert';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/api/media_upload_client.dart';
import 'package:dayli_mobile/compose/composer_controller.dart';
import 'package:dayli_mobile/compose/media_compressor.dart';
import 'package:dayli_mobile/compose/media_upload_controller.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

const mb = 1024 * 1024;

/// Records every step, in order, across the compressor and client.
final log = <String>[];

class LoggingCompressor extends FakeMediaCompressor {
  @override
  Future<CompressionResult> compress(DraftAttachment attachment) {
    log.add('compress ${attachment.localPath}');
    return super.compress(attachment);
  }
}

class LoggingClient extends FakeMediaUploadClient {
  /// When set, uploads wait for this before answering.
  Completer<void>? holdUpload;

  @override
  Future<ApiResult<MediaUploadTicket>> reserve({
    required String contentType,
    required int byteSize,
  }) {
    log.add('reserve');
    return super.reserve(contentType: contentType, byteSize: byteSize);
  }

  @override
  Future<ApiResult<void>> upload(MediaUploadTicket ticket, String path) async {
    log.add('upload ${ticket.reservationId}');
    await holdUpload?.future;
    return super.upload(ticket, path);
  }

  @override
  Future<ApiResult<MediaCheck>> complete(String reservationId) {
    log.add('complete $reservationId');
    return super.complete(reservationId);
  }
}

DraftAttachment picked(String name, {String mediaType = 'image'}) =>
    DraftAttachment(localPath: '/picked/$name', mediaType: mediaType);

CompressionSucceeded compressed(String path, int bytes) => CompressionSucceeded(
  CompressedMedia(path: path, contentType: 'image/jpeg', byteSize: bytes),
);

/// Lets the controllers' futures and zero-length timers run.
Future<void> settle() async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 1));
  }
}

void main() {
  late MemoryDraftStore drafts;
  late FakeSubmitter submitter;
  late LoggingCompressor compressor;
  late LoggingClient client;
  late List<ChangeNotifierHandle> opened;
  late int signOuts;

  setUp(() {
    log.clear();
    drafts = MemoryDraftStore();
    submitter = FakeSubmitter(
      const SubmissionAccepted(postId: 'post-1', replayed: false),
    );
    compressor = LoggingCompressor();
    client = LoggingClient();
    opened = [];
    signOuts = 0;
  });

  tearDown(() {
    for (final handle in opened) {
      handle.dispose();
    }
  });

  Future<(ComposerController, MediaUploadController)> open() async {
    final composer = ComposerController(
      userId: 'user-1',
      postingDays: FakePostingDayClient(ApiSuccess(postingDay())),
      drafts: drafts,
      submitter: submitter,
      onUnauthenticated: () {},
      clock: () => DateTime.utc(2026, 9, 25, 3),
      newIdempotencyKey: () => 'key-1',
      saveDelay: Duration.zero,
    );
    final uploads = MediaUploadController(
      composer: composer,
      compressor: compressor,
      client: client,
      onUnauthenticated: () => signOuts++,
      retryBase: const Duration(milliseconds: 2),
      retryMax: const Duration(milliseconds: 4),
    )..start();
    opened.add(ChangeNotifierHandle(composer, uploads));
    await composer.load();
    return (composer, uploads);
  }

  void add(ComposerController composer, DraftAttachment attachment) => composer
      .update(attachments: [...composer.draft!.attachments, attachment]);

  test('uploads a picked photo and records each step in the draft', () async {
    final (composer, uploads) = await open();
    add(composer, picked('a.heic'));
    await settle();

    final attachment = composer.draft!.attachments.single;
    expect(attachment.status, AttachmentUploadStatus.validated);
    expect(attachment.compressedPath, '/support/dayli-media/1.jpg');
    expect(attachment.contentType, 'image/jpeg');
    expect(attachment.byteSize, 1000);
    expect(attachment.reservationId, 'reservation-1');
    expect(client.reserved.single, (contentType: 'image/jpeg', byteSize: 1000));
    expect(client.uploaded.single.path, '/support/dayli-media/1.jpg');
    expect(uploads.active, isNull);

    final saved = drafts.drafts['user-1']!;
    expect(saved.attachments.single, attachment);
    // The upload URL is a credential and never reaches storage.
    expect(jsonEncode(saved.toJson()), isNot(contains('storage.example')));
  });

  test('works through attachments one at a time, in order', () async {
    final (composer, _) = await open();
    composer.update(attachments: [picked('a.jpg'), picked('b.jpg')]);
    await settle();

    expect(log, [
      'compress /picked/a.jpg',
      'reserve',
      'upload reservation-1',
      'complete reservation-1',
      'compress /picked/b.jpg',
      'reserve',
      'upload reservation-2',
      'complete reservation-2',
    ]);
    expect(
      composer.draft!.attachments.map((a) => a.status),
      everyElement(AttachmentUploadStatus.validated),
    );
  });

  test('drops a video over 15 seconds and says why', () async {
    compressor.results.add(
      const CompressionRejected(MediaLimitViolation.videoTooLong),
    );
    final (composer, uploads) = await open();
    add(composer, picked('long.mov', mediaType: 'video'));
    await settle();

    expect(composer.draft!.attachments, isEmpty);
    expect(uploads.notice, MediaLimitViolation.videoTooLong.message);
    expect(client.reserved, isEmpty);

    uploads.clearNotice();
    expect(uploads.notice, isNull);
  });

  test('drops a photo that takes the post past 25 MB', () async {
    compressor.results.addAll([
      compressed('/support/dayli-media/a.jpg', 10 * mb),
      compressed('/support/dayli-media/b.jpg', 10 * mb),
      compressed('/support/dayli-media/c.jpg', 5 * mb + 1),
    ]);
    final (composer, uploads) = await open();
    composer.update(
      attachments: [picked('a.jpg'), picked('b.jpg'), picked('c.jpg')],
    );
    await settle();

    expect(composer.draft!.attachments.map((a) => a.localPath), [
      '/picked/a.jpg',
      '/picked/b.jpg',
    ]);
    expect(uploads.notice, MediaLimitViolation.postTooLarge.message);
    expect(compressor.discarded, contains('/support/dayli-media/c.jpg'));
    expect(client.reserved, hasLength(2));
  });

  test('drops a file that cannot be read', () async {
    compressor.results.add(const CompressionFailed());
    final (composer, uploads) = await open();
    add(composer, picked('broken.jpg'));
    await settle();

    expect(composer.draft!.attachments, isEmpty);
    expect(uploads.notice, contains("couldn't be read"));
  });

  test('keeps a rejected upload as failed with the server reason', () async {
    client.completeResults.add(
      const ApiSuccess(
        MediaCheck(MediaCheckStatus.failed, failureReason: 'format_mismatch'),
      ),
    );
    final (composer, _) = await open();
    add(composer, picked('a.jpg'));
    await settle();

    final attachment = composer.draft!.attachments.single;
    expect(attachment.status, AttachmentUploadStatus.failed);
    expect(attachment.failureReason, 'format_mismatch');
    expect(client.completed, hasLength(1));
  });

  test('retries after going offline and keeps the draft', () async {
    client.uploadResults.addAll([
      const ApiError(NetworkUnavailable()),
      const ApiError(NetworkUnavailable()),
    ]);
    final (composer, uploads) = await open();
    final problems = <String>[];
    uploads.addListener(() {
      if (uploads.problem case final problem?) problems.add(problem);
    });
    add(composer, picked('a.jpg'));
    await settle();
    expect(problems, contains(contains("You're offline")));
    expect(uploads.problem, isNull);
    expect(client.uploaded, hasLength(3));
    expect(client.reserved, hasLength(1));
    expect(
      composer.draft!.attachments.single.status,
      AttachmentUploadStatus.validated,
    );
  });

  test('reserves again when the upload URL expired', () async {
    client.uploadResults.add(const ApiError(Expired()));
    final (composer, _) = await open();
    add(composer, picked('a.jpg'));
    await settle();

    expect(client.reserved, hasLength(2));
    expect(compressor.compressed, hasLength(1));
    final attachment = composer.draft!.attachments.single;
    expect(attachment.reservationId, 'reservation-2');
    expect(attachment.status, AttachmentUploadStatus.validated);
  });

  test(
    'reserves again when the reservation expired before completion',
    () async {
      client.completeResults.add(const ApiError(Expired()));
      final (composer, _) = await open();
      add(composer, picked('a.jpg'));
      await settle();

      expect(client.reserved, hasLength(2));
      expect(
        composer.draft!.attachments.single.status,
        AttachmentUploadStatus.validated,
      );
    },
  );

  group('after a restart', () {
    const inFlight = DraftAttachment(
      localPath: '/picked/a.jpg',
      mediaType: 'image',
      compressedPath: '/support/dayli-media/a.jpg',
      contentType: 'image/jpeg',
      byteSize: 1000,
      reservationId: 'reservation-9',
      status: AttachmentUploadStatus.uploading,
    );

    setUp(() {
      drafts.drafts['user-1'] = DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-25',
        promptId: 'prompt-09-25',
        promptText: 'What made you smile today?',
        idempotencyKey: 'saved-key',
        updatedAt: DateTime.utc(2026, 9, 25),
        attachments: const [inFlight],
      );
    });

    test('asks the server first and finishes a landed upload', () async {
      final (composer, _) = await open();
      await settle();

      expect(log, ['complete reservation-9']);
      expect(
        composer.draft!.attachments.single.status,
        AttachmentUploadStatus.validated,
      );
    });

    test('uploads again when the first upload never landed', () async {
      client.completeResults.add(
        const ApiSuccess(MediaCheck(MediaCheckStatus.pending)),
      );
      final (composer, _) = await open();
      await settle();

      expect(log, [
        'complete reservation-9',
        'reserve',
        'upload reservation-1',
        'complete reservation-1',
      ]);
      expect(compressor.compressed, isEmpty);
      expect(
        composer.draft!.attachments.single.status,
        AttachmentUploadStatus.validated,
      );
    });
  });

  test('deletes the compressed copy of a removed attachment', () async {
    client.holdUpload = Completer<void>();
    final (composer, _) = await open();
    add(composer, picked('a.jpg'));
    await settle();
    final path = composer.draft!.attachments.single.compressedPath!;

    composer.update(attachments: const []);
    client.holdUpload!.complete();
    await settle();

    expect(compressor.discarded, [path]);
    expect(composer.draft!.attachments, isEmpty);
  });

  test('keeps compressed copies when the draft is reloaded', () async {
    final (composer, _) = await open();
    add(composer, picked('a.jpg'));
    await settle();

    await composer.load();
    await settle();
    expect(compressor.discarded, isEmpty);
    expect(
      composer.draft!.attachments.single.status,
      AttachmentUploadStatus.validated,
    );
  });

  test('deletes compressed copies once the dayli is posted', () async {
    final (composer, _) = await open();
    composer.update(
      reflectiveAnswer: 'Coffee by the harbour',
      rating: () => 7,
      audience: PostAudience.solo,
      attachments: [picked('a.jpg')],
    );
    await settle();

    await composer.submit();
    await settle();
    expect(composer.phase, ComposerPhase.posted);
    expect(compressor.discarded, ['/support/dayli-media/1.jpg']);
  });

  group('when the session has expired', () {
    test('hands a reserve 401 to sign-out and stops retrying', () async {
      client.reserveResults.add(const ApiError(Unauthenticated()));
      final (composer, uploads) = await open();
      add(composer, picked('a.jpg'));
      await settle();
      // Well past every backoff delay: nothing retries with the dead session.
      await settle();

      expect(signOuts, 1);
      expect(client.reserved, hasLength(1));
      expect(uploads.problem, contains('Sign in'));
      final attachment = composer.draft!.attachments.single;
      expect(attachment.status, AttachmentUploadStatus.pending);
      expect(attachment.compressedPath, isNotNull);
    });

    test('hands a completion 401 to sign-out and keeps the upload', () async {
      client.completeResults.add(const ApiError(Unauthenticated()));
      final (composer, _) = await open();
      add(composer, picked('a.jpg'));
      await settle();
      await settle();

      expect(signOuts, 1);
      expect(client.completed, ['reservation-1']);
      final attachment = composer.draft!.attachments.single;
      expect(attachment.status, AttachmentUploadStatus.uploading);
      expect(attachment.reservationId, 'reservation-1');
    });

    test('resumes after signing in again', () async {
      client.reserveResults.add(const ApiError(Unauthenticated()));
      final (composer, uploads) = await open();
      add(composer, picked('a.jpg'));
      await settle();

      uploads.retryNow();
      await settle();
      expect(signOuts, 1);
      expect(uploads.problem, isNull);
      expect(
        composer.draft!.attachments.single.status,
        AttachmentUploadStatus.validated,
      );
    });
  });

  test('backs off when too many uploads are waiting', () async {
    client.reserveResults.add(const ApiError(RateLimited()));
    final (composer, _) = await open();
    add(composer, picked('a.jpg'));
    await settle();

    expect(client.reserved, hasLength(2));
    expect(
      composer.draft!.attachments.single.status,
      AttachmentUploadStatus.validated,
    );
  });

  test('uploads nothing for a draft that can no longer be posted', () async {
    drafts.drafts['user-1'] = DailyPostDraft(
      userId: 'user-1',
      localDate: '2026-09-24',
      promptId: 'prompt-09-24',
      promptText: 'Yesterday',
      idempotencyKey: 'old-key',
      updatedAt: DateTime.utc(2026, 9, 24),
      attachments: [picked('a.jpg')],
    );
    final (composer, _) = await open();
    await settle();

    expect(composer.phase, ComposerPhase.missedDeadline);
    expect(log, isEmpty);
  });
}

/// Disposes a composer and its upload controller together after each test.
class ChangeNotifierHandle {
  ChangeNotifierHandle(this.composer, this.uploads);

  final ComposerController composer;
  final MediaUploadController uploads;

  void dispose() {
    uploads.dispose();
    composer.dispose();
  }
}

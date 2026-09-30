import 'dart:async';

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/compose/composer_controller.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/fakes.dart';

const photo = DraftAttachment(localPath: '/photos/0.jpg', mediaType: 'image');

void main() {
  late MemoryDraftStore drafts;
  late FakePostingDayClient days;
  late FakeSubmitter submitter;
  late int unauthenticated;

  ComposerController controller() => ComposerController(
    userId: 'user-1',
    postingDays: days,
    drafts: drafts,
    submitter: submitter,
    onUnauthenticated: () => unauthenticated++,
    clock: () => DateTime.utc(2026, 9, 25, 3),
    newIdempotencyKey: () => 'key-${drafts.writes}',
    saveDelay: Duration.zero,
  );

  void fill(ComposerController composer) => composer.update(
    reflectiveAnswer: '  Coffee by the harbour  ',
    rating: () => 7,
    audience: PostAudience.friends,
    tomorrowNote: 'Bring the camera.',
    attachments: const [photo],
  );

  DailyPostDraft savedToday({String answer = 'Unsent words'}) => DailyPostDraft(
    userId: 'user-1',
    localDate: '2026-09-25',
    promptId: 'prompt-09-25',
    promptText: 'What made you smile today?',
    idempotencyKey: 'saved-key',
    updatedAt: DateTime.utc(2026, 9, 25),
    reflectiveAnswer: answer,
  );

  setUp(() {
    drafts = MemoryDraftStore();
    days = FakePostingDayClient(ApiSuccess(postingDay()));
    submitter = FakeSubmitter(
      const SubmissionAccepted(postId: 'post-1', replayed: false),
    );
    unauthenticated = 0;
  });

  test('starts a draft for the server day and saves edits', () async {
    final composer = controller();
    await composer.load();
    fill(composer);
    await Future<void>.delayed(Duration.zero);

    expect(composer.phase, ComposerPhase.editing);
    final saved = drafts.drafts['user-1']!;
    expect(saved.localDate, '2026-09-25');
    expect(saved.promptId, 'prompt-09-25');
    expect(saved.rating, 7);
  });

  test('restores a saved draft for today with its idempotency key', () async {
    await drafts.write(
      DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-25',
        promptId: 'prompt-09-25',
        promptText: 'What made you smile today?',
        idempotencyKey: 'saved-key',
        updatedAt: DateTime.utc(2026, 9, 25),
        reflectiveAnswer: 'Half written',
      ),
    );
    final composer = controller();
    await composer.load();

    expect(composer.draft!.reflectiveAnswer, 'Half written');
    expect(composer.draft!.idempotencyKey, 'saved-key');
  });

  test('validates before submitting and never sends invalid drafts', () async {
    final composer = controller();
    await composer.load();
    await composer.submit();

    expect(composer.errors.rating, isNotNull);
    expect(composer.errors.reflectiveAnswer, isNotNull);
    expect(composer.errors.audience, 'Choose who can see this dayli');
    expect(submitter.submitted, isEmpty);
  });

  test('clears the draft only after the server accepts it', () async {
    final composer = controller();
    await composer.load();
    fill(composer);
    await composer.submit();

    expect(submitter.submitted.single.reflectiveAnswer, contains('harbour'));
    expect(composer.phase, ComposerPhase.posted);
    expect(drafts.drafts, isEmpty);
  });

  for (final (name, failure) in [
    ('offline', const NetworkUnavailable() as ApiFailure),
    ('server outage', const ServiceUnavailable()),
  ]) {
    test('keeps the draft and its key after a $name', () async {
      submitter.result = SubmissionFailed(failure);
      final composer = controller();
      await composer.load();
      fill(composer);
      await composer.submit();
      final key = composer.draft!.idempotencyKey;

      expect(composer.phase, ComposerPhase.editing);
      expect(composer.message, isNotNull);
      expect(drafts.drafts['user-1']!.reflectiveAnswer, contains('harbour'));

      submitter.result = const SubmissionAccepted(postId: 'p', replayed: true);
      await composer.submit();
      expect(submitter.submitted.map((d) => d.idempotencyKey), [key, key]);
      expect(composer.phase, ComposerPhase.posted);
    });
  }

  test('keeps the words but refuses to backdate after midnight', () async {
    submitter.result = const SubmissionRejected(
      SubmissionConflict.postingDayClosed,
    );
    final composer = controller();
    await composer.load();
    fill(composer);
    await composer.submit();

    expect(composer.phase, ComposerPhase.missedDeadline);
    expect(drafts.drafts['user-1'], isNotNull);
  });

  test('shows a draft from an earlier day as missed until discarded', () async {
    await drafts.write(
      DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-24',
        promptId: 'prompt-09-24',
        promptText: 'Yesterday',
        idempotencyKey: 'old-key',
        updatedAt: DateTime.utc(2026, 9, 24),
        reflectiveAnswer: 'Unsent',
      ),
    );
    final composer = controller();
    await composer.load();
    expect(composer.phase, ComposerPhase.missedDeadline);
    expect(composer.draft!.reflectiveAnswer, 'Unsent');

    await composer.discardDraft();
    expect(composer.phase, ComposerPhase.editing);
    expect(composer.draft!.localDate, '2026-09-25');
    expect(composer.draft!.reflectiveAnswer, isEmpty);
  });

  test('refreshes a changed prompt without losing the text', () async {
    submitter.result = const SubmissionRejected(
      SubmissionConflict.promptChanged,
    );
    final composer = controller();
    await composer.load();
    fill(composer);
    days.result = ApiSuccess(
      postingDay(promptId: 'prompt-09-25-v2', promptText: 'New'),
    );
    await composer.submit();

    expect(composer.phase, ComposerPhase.editing);
    expect(composer.draft!.promptId, 'prompt-09-25-v2');
    expect(composer.draft!.reflectiveAnswer, contains('harbour'));
    expect(composer.message, contains('prompt has changed'));
  });

  test('lets the author keep drafting offline from a saved draft', () async {
    await drafts.write(
      DailyPostDraft(
        userId: 'user-1',
        localDate: '2026-09-25',
        promptId: 'prompt-09-25',
        promptText: 'What made you smile today?',
        idempotencyKey: 'k',
        updatedAt: DateTime.utc(2026, 9, 25),
      ),
    );
    days.result = const ApiError(NetworkUnavailable());
    final composer = controller();
    await composer.load();

    expect(composer.phase, ComposerPhase.editing);
    expect(composer.offline, isTrue);
    expect(composer.draft!.promptText, 'What made you smile today?');
  });

  test('reports an expired session', () async {
    days.result = const ApiError(Unauthenticated());
    await controller().load();
    expect(unauthenticated, 1);
  });

  test('shows the posted state when today is already posted', () async {
    days.result = ApiSuccess(postingDay(hasPosted: true));
    final composer = controller();
    await composer.load();
    expect(composer.phase, ComposerPhase.posted);
  });

  test('clears an empty draft for a day that is already posted', () async {
    await drafts.write(savedToday(answer: ''));
    days.result = ApiSuccess(postingDay(hasPosted: true));
    final composer = controller();
    await composer.load();

    expect(composer.phase, ComposerPhase.posted);
    expect(drafts.drafts, isEmpty);
  });

  test('keeps unposted words when today is already posted', () async {
    await drafts.write(savedToday());
    days.result = ApiSuccess(postingDay(hasPosted: true));
    final composer = controller();
    await composer.load();

    expect(composer.phase, ComposerPhase.alreadyPosted);
    expect(composer.draft!.reflectiveAnswer, 'Unsent words');
    expect(drafts.drafts['user-1'], isNotNull);

    await composer.discardDraft();
    expect(composer.phase, ComposerPhase.posted);
    expect(drafts.drafts, isEmpty);
  });

  for (final (conflict, text) in [
    (SubmissionConflict.alreadyPosted, 'already posted'),
    (SubmissionConflict.idempotencyKeyReused, 'earlier version'),
  ]) {
    test('keeps the draft after ${conflict.reason}', () async {
      submitter.result = SubmissionRejected(conflict);
      final composer = controller();
      await composer.load();
      fill(composer);
      await composer.submit();

      expect(composer.phase, ComposerPhase.alreadyPosted);
      expect(composer.message, contains(text));
      expect(composer.draft!.reflectiveAnswer, contains('harbour'));
      expect(drafts.drafts['user-1']!.reflectiveAnswer, contains('harbour'));
    });
  }

  test(
    'reloads the day when the draft is dated before the server day',
    () async {
      submitter.result = const SubmissionRejected(
        SubmissionConflict.postingDayNotOpen,
      );
      final composer = controller();
      await composer.load();
      fill(composer);
      await composer.submit();

      expect(days.calls, 2);
      expect(composer.phase, ComposerPhase.editing);
      expect(composer.draft!.reflectiveAnswer, contains('harbour'));
    },
  );

  test('keeps the draft when the session expires while posting', () async {
    submitter.result = const SubmissionFailed(Unauthenticated());
    final composer = controller();
    await composer.load();
    fill(composer);
    await composer.submit();

    expect(unauthenticated, 1);
    expect(composer.message, contains('Sign in again'));
    expect(drafts.drafts['user-1']!.reflectiveAnswer, contains('harbour'));
  });

  test('shows a rejected field message and keeps the draft', () async {
    submitter.result = const SubmissionFailed(
      InvalidRequest('Some details need another look.'),
    );
    final composer = controller();
    await composer.load();
    fill(composer);
    await composer.submit();

    expect(composer.phase, ComposerPhase.editing);
    expect(composer.message, 'Some details need another look.');
    expect(drafts.drafts['user-1'], isNotNull);
  });

  test('allows a text-only post once an audience is chosen', () async {
    final composer = controller();
    await composer.load();
    composer.update(reflectiveAnswer: 'Coffee', rating: () => 7);
    await composer.submit();

    expect(composer.errors.audience, isNotNull);
    expect(submitter.submitted, isEmpty);

    composer.update(audience: PostAudience.solo);
    expect(composer.errors.audience, isNull);
    await composer.submit();

    expect(submitter.submitted.single.audience, PostAudience.solo);
    expect(submitter.submitted.single.attachments, isEmpty);
    expect(composer.phase, ComposerPhase.posted);
  });

  test('rechecks the server day when the deadline passes', () {
    fakeAsync((async) {
      final composer = controller();
      composer.load();
      async.flushMicrotasks();
      fill(composer);
      async.flushMicrotasks();
      expect(composer.phase, ComposerPhase.editing);

      // The server now reports the next day; the draft must not be backdated.
      days.result = ApiSuccess(
        postingDay(localDate: '2026-09-26', promptId: 'prompt-09-26'),
      );
      // serverNow is 03:00Z and the deadline 12:00Z.
      async.elapse(const Duration(hours: 8, minutes: 59));
      expect(days.calls, 1);
      async.elapse(const Duration(minutes: 2));

      expect(days.calls, 2);
      expect(composer.phase, ComposerPhase.missedDeadline);
      expect(composer.draft!.reflectiveAnswer, contains('harbour'));
      composer.dispose();
    });
  });

  test(
    'ignores edits while a post is sending, then keeps what was sent',
    () async {
      final composer = controller();
      await composer.load();
      fill(composer);
      submitter.hold = Completer();
      final sending = composer.submit();
      await Future<void>.delayed(Duration.zero);
      expect(composer.submitting, isTrue);

      composer.update(
        reflectiveAnswer: 'Typed while sending',
        rating: () => 2,
        audience: PostAudience.solo,
      );
      expect(composer.draft!.reflectiveAnswer, contains('harbour'));
      expect(composer.draft!.rating, 7);
      expect(composer.draft!.audience, PostAudience.friends);

      submitter.hold!.complete(
        const SubmissionAccepted(postId: 'post-1', replayed: false),
      );
      await sending;
      expect(submitter.submitted.single.reflectiveAnswer, contains('harbour'));
      expect(composer.phase, ComposerPhase.posted);
    },
  );

  test('allows edits again when a post fails to send', () async {
    final composer = controller();
    await composer.load();
    fill(composer);
    submitter.hold = Completer();
    final sending = composer.submit();
    await Future<void>.delayed(Duration.zero);
    submitter.hold!.complete(const SubmissionFailed(NetworkUnavailable()));
    await sending;

    expect(composer.submitting, isFalse);
    composer.update(reflectiveAnswer: 'Edited after the failure');
    expect(composer.draft!.reflectiveAnswer, 'Edited after the failure');
  });

  test('rechecks the day after a send that spanned the deadline fails', () {
    fakeAsync((async) {
      final composer = controller();
      composer.load();
      async.flushMicrotasks();
      fill(composer);
      async.flushMicrotasks();

      submitter.hold = Completer();
      composer.submit();
      async.flushMicrotasks();
      expect(composer.submitting, isTrue);

      // The deadline (12:00Z, server time 03:00Z) passes mid-request.
      days.result = ApiSuccess(
        postingDay(localDate: '2026-09-26', promptId: 'prompt-09-26'),
      );
      async.elapse(const Duration(hours: 9, minutes: 1));
      expect(days.calls, 1);

      submitter.hold!.complete(const SubmissionFailed(NetworkUnavailable()));
      async.flushMicrotasks();

      expect(days.calls, 2);
      expect(composer.phase, ComposerPhase.missedDeadline);
      expect(composer.draft!.reflectiveAnswer, contains('harbour'));
      composer.dispose();
    });
  });

  test('does not recheck the day when the spanning send is accepted', () {
    fakeAsync((async) {
      final composer = controller();
      composer.load();
      async.flushMicrotasks();
      fill(composer);
      async.flushMicrotasks();

      submitter.hold = Completer();
      composer.submit();
      async.flushMicrotasks();
      async.elapse(const Duration(hours: 9, minutes: 1));
      submitter.hold!.complete(
        const SubmissionAccepted(postId: 'post-1', replayed: false),
      );
      async.flushMicrotasks();

      expect(days.calls, 1);
      expect(composer.phase, ComposerPhase.posted);
      composer.dispose();
    });
  });

  test('counts emoji as single characters', () {
    final base = DailyPostDraft(
      userId: 'u',
      localDate: 'd',
      promptId: 'p',
      promptText: 't',
      idempotencyKey: 'k',
      updatedAt: DateTime.utc(2026),
      rating: 5,
      audience: PostAudience.friends,
    );
    expect(
      validateDraft(base.copyWith(reflectiveAnswer: '😀' * 4000)).isEmpty,
      isTrue,
    );
    expect(
      validateDraft(
        base.copyWith(reflectiveAnswer: '😀' * 4001),
      ).reflectiveAnswer,
      isNotNull,
    );
  });

  test('generates version-4 UUID idempotency keys', () {
    expect(
      generateIdempotencyKey(),
      matches(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ),
      ),
    );
  });

  group('with media uploads', () {
    const uploading = DraftAttachment(
      localPath: '/photos/0.jpg',
      mediaType: 'image',
      compressedPath: '/support/dayli-media/0.jpg',
      contentType: 'image/jpeg',
      byteSize: 1000,
      reservationId: 'reservation-1',
      status: AttachmentUploadStatus.uploading,
    );

    test('ignores upload state unless the build uploads media', () {
      final draft = savedToday().copyWith(attachments: const [uploading]);
      expect(validateDraft(draft).media, isNull);
      expect(
        validateDraft(draft, requireUploadedMedia: true).media,
        contains('finish uploading'),
      );
      expect(
        validateDraft(
          draft.copyWith(
            attachments: [
              uploading.copyWith(
                status: AttachmentUploadStatus.failed,
                failureReason: () => 'format_mismatch',
              ),
            ],
          ),
          requireUploadedMedia: true,
        ).media,
        contains("couldn't be uploaded"),
      );
      expect(
        validateDraft(
          draft.copyWith(
            attachments: [
              uploading.copyWith(status: AttachmentUploadStatus.validated),
            ],
          ),
          requireUploadedMedia: true,
        ).media,
        isNull,
      );
    });

    test('holds the post until uploads pass, then clears the error', () async {
      final composer = ComposerController(
        userId: 'user-1',
        postingDays: days,
        drafts: drafts,
        submitter: submitter,
        onUnauthenticated: () => unauthenticated++,
        clock: () => DateTime.utc(2026, 9, 25, 3),
        newIdempotencyKey: () => 'key-1',
        saveDelay: Duration.zero,
        requireUploadedMedia: true,
      );
      await composer.load();
      fill(composer);
      composer.update(attachments: const [uploading]);

      await composer.submit();
      expect(submitter.submitted, isEmpty);
      expect(composer.errors.media, contains('finish uploading'));

      expect(
        composer.replaceAttachment(
          uploading,
          uploading.copyWith(status: AttachmentUploadStatus.validated),
        ),
        isTrue,
      );
      expect(composer.errors.media, isNull);

      await composer.submit();
      expect(submitter.submitted, hasLength(1));
      composer.dispose();
    });

    test('reports an attachment that is no longer in the draft', () async {
      final composer = controller();
      await composer.load();
      expect(composer.replaceAttachment(photo, photo), isFalse);
      expect(composer.removeAttachment(photo), isFalse);
      composer.dispose();
    });
  });
}

import 'package:dayli_mobile/api/api_failure.dart';
import 'package:dayli_mobile/compose/composer_controller.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:dayli_mobile/posts/post_submitter.dart';
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
    tomorrowNote: 'Bring the camera.',
    attachments: const [photo],
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

    await composer.discardMissedDraft();
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

  test('requires a photo or video, like WDCC', () async {
    final composer = controller();
    await composer.load();
    composer.update(reflectiveAnswer: 'Coffee', rating: () => 7);
    await composer.submit();

    expect(composer.errors.media, 'Please upload at least one file');
    expect(submitter.submitted, isEmpty);

    composer.update(attachments: const [photo]);
    expect(composer.errors.media, isNull);
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
      attachments: const [photo],
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
}

import 'package:dayli_mobile/app/app.dart';
import 'package:dayli_mobile/compose/composer_screen.dart';
import 'package:dayli_mobile/compose/media_picker.dart';
import 'package:dayli_mobile/compose/pending_capture.dart';
import 'package:dayli_mobile/drafts/daily_post_draft.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/compose_actions.dart';
import 'support/fakes.dart';

const _photoOption = Key('composer.media.source.photo');
const _videoOption = Key('composer.media.source.video');

Future<void> _openComposer(WidgetTester tester, TestHarness harness) async {
  await tester.pumpWidget(
    DayliApp(services: harness.services, useGoogleFonts: false),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('landing.sign-in')));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.byKey(const Key('auth.email')),
    'jos@example.test',
  );
  await tester.enterText(
    find.byKey(const Key('auth.password')),
    'correct-password',
  );
  await tester.tap(find.byKey(const Key('auth.submit')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('shell.newDayli')));
  await tester.pumpAndSettle();
}

Finder _list() => find
    .descendant(
      of: find.byType(ComposerScreen),
      matching: find.byType(Scrollable),
    )
    .first;

Future<void> _openSheet(WidgetTester tester, int slot) async {
  await showMediaTile(tester, slot);
  await tester.tap(find.byKey(Key('composer.media.$slot')));
  await tester.pumpAndSettle();
}

Future<void> _choose(WidgetTester tester, Key option) async {
  await tester.tap(find.byKey(option));
  await tester.pumpAndSettle();
}

/// Rates, writes and posts with no media, so the media state is what's tested.
Future<void> _post(WidgetTester tester) async {
  final list = _list();
  await tester.scrollUntilVisible(
    find.byKey(const Key('composer.rating')),
    100,
    scrollable: list,
  );
  await tester.drag(
    find.byKey(const Key('composer.rating')),
    const Offset(370, 0),
  );
  await tester.pump();
  await tester.scrollUntilVisible(
    find.byKey(const Key('composer.reflectiveAnswer')),
    100,
    scrollable: list,
  );
  await tester.enterText(
    find.byKey(const Key('composer.reflectiveAnswer')),
    'Coffee by the harbour',
  );
  await tester.scrollUntilVisible(
    find.byKey(const Key('composer.audience.solo')),
    100,
    scrollable: list,
  );
  await tester.tap(find.byKey(const Key('composer.audience.solo')));
  await tester.pump(const Duration(milliseconds: 500));
  await tester.ensureVisible(find.byKey(const Key('composer.submit')));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('composer.submit')));
  await tester.pumpAndSettle();
}

String _status(WidgetTester tester) =>
    tester.widget<Text>(find.byKey(const Key('composer.media.status'))).data!;

/// Today's saved draft for the signed-in test user, whose identity is
/// `2026-09-25:saved-key`.
void _seedDraft(TestHarness harness) {
  harness.drafts.drafts['user-1'] = DailyPostDraft(
    userId: 'user-1',
    localDate: '2026-09-25',
    promptId: 'prompt-09-25',
    promptText: 'What made you smile today?',
    idempotencyKey: 'saved-key',
    updatedAt: DateTime.utc(2026, 9, 25),
  );
}

/// A pick the app recorded before Android ended it. [userId] and [draftKey]
/// default to the signed-in test user's seeded draft.
void _recordPick(
  TestHarness harness, {
  String userId = 'user-1',
  String draftKey = '2026-09-25:saved-key',
  DateTime? startedAt,
}) {
  harness.pendingStore.value = PendingCapture(
    userId: userId,
    draftKey: draftKey,
    startedAt: startedAt ?? DateTime.utc(2026, 9, 25, 2),
  );
}

DraftAttachment _lost(String path) =>
    DraftAttachment(localPath: path, mediaType: 'image');

void main() {
  group('the source sheet', () {
    testWidgets(
      'offers the camera, a video and the library for the first slot',
      (tester) async {
        await _openComposer(tester, TestHarness());
        await _openSheet(tester, 0);

        expect(find.byKey(_photoOption), findsOneWidget);
        expect(find.byKey(_videoOption), findsOneWidget);
        expect(find.text('Choose a photo or video'), findsOneWidget);
      },
    );

    testWidgets('offers only photos once a photo is in the first slot', (
      tester,
    ) async {
      await _openComposer(tester, TestHarness());
      await addFromLibrary(tester, 0);
      await _openSheet(tester, 1);

      expect(find.byKey(_photoOption), findsOneWidget);
      expect(find.byKey(_videoOption), findsNothing);
      expect(find.text('Choose a photo'), findsOneWidget);
    });

    testWidgets('closing it adds nothing and asks nothing of the camera', (
      tester,
    ) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _openSheet(tester, 0);
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      expect(harness.mediaPicker.captures, 0);
      expect(find.byKey(_photoOption), findsNothing);
      expect(_status(tester), 'Optional. Add up to 3 photos, or 1 video.');
    });
  });

  group('taking a photo', () {
    testWidgets('behaves like a library photo: it uploads and posts', (
      tester,
    ) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _openSheet(tester, 0);
      await _choose(tester, _photoOption);

      expect(_status(tester), contains('1/3 added'));
      expect(
        harness.mediaCompressor.compressed.single.localPath,
        '/camera/0.jpg',
      );
      await _post(tester);

      final sent = harness.submitter.submitted.single;
      expect(sent.attachments.single.localPath, '/camera/0.jpg');
      expect(sent.attachments.single.mediaType, 'image');
      expect(sent.attachments.single.status, AttachmentUploadStatus.validated);
      expect(harness.mediaUploads.completed, ['reservation-1']);
    });

    testWidgets('fills the next slots like any photo, up to three', (
      tester,
    ) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _openSheet(tester, 0);
      await _choose(tester, _photoOption);
      await _openSheet(tester, 1);
      await _choose(tester, _photoOption);
      await addFromLibrary(tester, 2);

      expect(_status(tester), contains('3/3 added'));
      expect(find.byKey(const Key('composer.media.3')), findsNothing);
      expect(harness.mediaPicker.captures, 2);
    });

    testWidgets('closing the camera without a photo changes nothing', (
      tester,
    ) async {
      final harness = TestHarness();
      harness.mediaPicker.captureOutcomes.add(const CaptureCancelled());
      await _openComposer(tester, harness);
      await _openSheet(tester, 0);
      await _choose(tester, _photoOption);

      expect(_status(tester), 'Optional. Add up to 3 photos, or 1 video.');
      expect(find.byKey(const Key('composer.media.settings')), findsNothing);
      expect(harness.mediaCompressor.compressed, isEmpty);
    });
  });

  group('recording a video', () {
    testWidgets('fills the post, which then takes nothing more', (
      tester,
    ) async {
      final harness = TestHarness();
      await _openComposer(tester, harness);
      await _openSheet(tester, 0);
      await _choose(tester, _videoOption);

      expect(_status(tester), '1/3 added.');
      expect(find.byKey(const Key('composer.media.1')), findsNothing);
      expect(harness.mediaCompressor.compressed.single.mediaType, 'video');
      expect(
        harness.mediaCompressor.compressed.single.localPath,
        '/camera/0.mp4',
      );
    });
  });

  group('when the camera is not available to the app', () {
    Future<TestHarness> openWith(
      WidgetTester tester,
      CaptureFailure reason,
    ) async {
      final harness = TestHarness();
      harness.mediaPicker.captureOutcomes.add(CaptureFailed(reason));
      await _openComposer(tester, harness);
      await _openSheet(tester, 0);
      await _choose(tester, _photoOption);
      return harness;
    }

    testWidgets('a declined prompt says so and keeps the library', (
      tester,
    ) async {
      final harness = await openWith(tester, CaptureFailure.denied);

      expect(
        find.text(
          'Camera access was declined. You can still choose from your library.',
        ),
        findsOneWidget,
      );
      // It can be asked again, so Settings isn't the only way back.
      expect(find.byKey(const Key('composer.media.settings')), findsNothing);
      expect(harness.mediaPicker.settingsOpened, 0);

      await addFromLibrary(tester, 0);
      expect(_status(tester), contains('1/3 added'));
      expect(find.textContaining('Camera access'), findsNothing);
    });

    testWidgets('a refusal for good offers Settings, which opens them', (
      tester,
    ) async {
      final harness = await openWith(tester, CaptureFailure.permanentlyDenied);

      expect(
        find.text(
          'Camera access is off for Dayli. Turn it on in Settings, or choose '
          'from your library.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(const Key('composer.media.settings')));
      await tester.pumpAndSettle();
      expect(harness.mediaPicker.settingsOpened, 1);
    });

    testWidgets('a device restriction has no Settings action', (tester) async {
      await openWith(tester, CaptureFailure.restricted);

      expect(
        find.text(
          'The camera is restricted on this device. You can still choose from '
          'your library.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(const Key('composer.media.settings')), findsNothing);
    });

    testWidgets('a missing camera says so', (tester) async {
      await openWith(tester, CaptureFailure.unavailable);

      expect(
        find.text(
          'No camera is available. You can still choose from your library.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('the notice clears when the author tries again', (
      tester,
    ) async {
      final harness = await openWith(tester, CaptureFailure.denied);
      expect(find.textContaining('Camera access'), findsOneWidget);

      harness.mediaPicker.captureOutcomes.clear();
      await _openSheet(tester, 0);
      await _choose(tester, _photoOption);

      expect(find.textContaining('Camera access'), findsNothing);
      expect(_status(tester), contains('1/3 added'));
    });

    testWidgets('never blocks posting words with no media', (tester) async {
      final harness = await openWith(tester, CaptureFailure.permanentlyDenied);
      await _post(tester);

      final sent = harness.submitter.submitted.single;
      expect(sent.reflectiveAnswer, 'Coffee by the harbour');
      expect(sent.attachments, isEmpty);
    });
  });

  group('who a pick belongs to', () {
    testWidgets('is recorded before the camera opens and cleared after', (
      tester,
    ) async {
      final harness = TestHarness();
      _seedDraft(harness);
      PendingCapture? whileOpen;
      harness.mediaPicker.whileOpen = () =>
          whileOpen = harness.pendingStore.value;
      await _openComposer(tester, harness);
      await _openSheet(tester, 0);
      await _choose(tester, _photoOption);

      expect(whileOpen?.userId, 'user-1');
      expect(whileOpen?.draftKey, '2026-09-25:saved-key');
      expect(harness.pendingStore.value, isNull);
    });

    testWidgets('is recorded for the library too, since it can be killed too', (
      tester,
    ) async {
      final harness = TestHarness();
      _seedDraft(harness);
      PendingCapture? whileOpen;
      harness.mediaPicker.whileOpen = () =>
          whileOpen = harness.pendingStore.value;
      await _openComposer(tester, harness);
      await addFromLibrary(tester, 0);

      expect(whileOpen?.userId, 'user-1');
      expect(harness.pendingStore.value, isNull);
    });

    testWidgets('is cleared when the camera is closed or refused', (
      tester,
    ) async {
      final harness = TestHarness();
      _seedDraft(harness);
      harness.mediaPicker.captureOutcomes.addAll([
        const CaptureCancelled(),
        const CaptureFailed(CaptureFailure.denied),
      ]);
      await _openComposer(tester, harness);
      await _openSheet(tester, 0);
      await _choose(tester, _photoOption);
      expect(harness.pendingStore.value, isNull);

      await _openSheet(tester, 0);
      await _choose(tester, _photoOption);
      expect(harness.pendingStore.value, isNull);
    });
  });

  group('after Android ended the app mid-capture', () {
    testWidgets('adds the photo to the user and draft that started it', (
      tester,
    ) async {
      final harness = TestHarness();
      _seedDraft(harness);
      _recordPick(harness);
      harness.mediaPicker.lostCapture = _lost('/camera/lost.jpg');
      await _openComposer(tester, harness);
      await tester.pumpAndSettle();

      expect(_status(tester), contains('1/3 added'));
      expect(
        harness.mediaCompressor.compressed.single.localPath,
        '/camera/lost.jpg',
      );
      expect(harness.pendingStore.value, isNull);
    });

    testWidgets('never adds another account\'s photo to this draft', (
      tester,
    ) async {
      // user-9 started the capture and the app was killed; user-1 signs in and
      // opens a composer first. Nothing may reach user-1's draft or account.
      final harness = TestHarness();
      _seedDraft(harness);
      _recordPick(harness, userId: 'user-9');
      harness.mediaPicker.lostCapture = _lost('/camera/user-9.jpg');
      await _openComposer(tester, harness);
      await tester.pumpAndSettle();

      expect(_status(tester), 'Optional. Add up to 3 photos, or 1 video.');
      expect(harness.mediaCompressor.compressed, isEmpty);
      expect(harness.mediaUploads.completed, isEmpty);
      expect(harness.drafts.drafts['user-1']?.attachments, isEmpty);
      // Kept for its owner, not deleted, and still theirs.
      expect(harness.deletedFiles, isEmpty);
      expect(harness.pendingStore.value?.userId, 'user-9');
      expect(
        harness.pendingStore.value?.recovered?.localPath,
        '/camera/user-9.jpg',
      );
    });

    testWidgets('never adds a photo started for a different draft', (
      tester,
    ) async {
      final harness = TestHarness();
      _seedDraft(harness);
      _recordPick(harness, draftKey: '2026-09-24:yesterday');
      harness.mediaPicker.lostCapture = _lost('/camera/yesterday.jpg');
      await _openComposer(tester, harness);
      await tester.pumpAndSettle();

      expect(_status(tester), 'Optional. Add up to 3 photos, or 1 video.');
      expect(harness.mediaCompressor.compressed, isEmpty);
      expect(
        harness.pendingStore.value?.recovered?.localPath,
        '/camera/yesterday.jpg',
      );
    });

    testWidgets('removes a photo nobody recorded starting', (tester) async {
      final harness = TestHarness();
      _seedDraft(harness);
      harness.mediaPicker.lostCapture = _lost('/camera/orphan.jpg');
      await _openComposer(tester, harness);
      await tester.pumpAndSettle();

      expect(_status(tester), 'Optional. Add up to 3 photos, or 1 video.');
      expect(harness.mediaCompressor.compressed, isEmpty);
      expect(harness.deletedFiles, ['/camera/orphan.jpg']);
    });

    testWidgets('removes a photo whose record is too old to trust', (
      tester,
    ) async {
      final harness = TestHarness();
      _seedDraft(harness);
      _recordPick(harness, startedAt: DateTime.utc(2026, 9, 23, 3));
      harness.mediaPicker.lostCapture = _lost('/camera/old.jpg');
      await _openComposer(tester, harness);
      await tester.pumpAndSettle();

      expect(harness.mediaCompressor.compressed, isEmpty);
      expect(harness.deletedFiles, ['/camera/old.jpg']);
      expect(harness.pendingStore.value, isNull);
    });

    testWidgets('does not add a photo the draft already has', (tester) async {
      final harness = TestHarness();
      _seedDraft(harness);
      await _openComposer(tester, harness);
      await addFromLibrary(tester, 0);
      expect(_status(tester), contains('1/3 added'));

      // Leave the composer and open it again, which asks the platform again.
      await tester.tap(find.byKey(const Key('composer.close')));
      await tester.pumpAndSettle();
      _recordPick(harness);
      harness.mediaPicker.lostCapture = _lost('/photos/0.jpg');
      await tester.tap(find.byKey(const Key('shell.newDayli')));
      await tester.pumpAndSettle();

      expect(_status(tester), contains('1/3 added'));
      expect(find.byKey(const Key('composer.media.1')), findsOneWidget);
      expect(find.byKey(const Key('composer.media.2')), findsNothing);
    });
  });
}
